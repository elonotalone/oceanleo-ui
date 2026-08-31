/**
 * 弹簧原语的纯函数闸。`docs/architecture/motion-system.md` §规范二 的六条实现
 * 约束，除了「调用方只写 transform/opacity」（那条在 motion-compositor-only
 * 里判）之外，其余五条都在本文件锁住。
 *
 * 这里刻意**不用 jsdom**：原语不碰 DOM 是规范二实现约束 3，能在纯 Node 里跑完
 * 就是那条约束的证明本身。rAF 用替身，所以时间是确定的，没有 sleep。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const OVERDAMPED = { stiffness: 210, damping: 40 };
const DEFAULT_CONFIG = { stiffness: 210, damping: 20 };
const FRAME_MS = 1000 / 60;

function sourcePath(relative) {
  return fileURLToPath(new URL(relative, import.meta.url));
}

/**
 * rAF 替身。记录「被请求了多少次」，因为「全部 settled 时必须停掉 rAF」
 * （实现约束 2）只能靠计数与 pending 状态来证明，看值是看不出来的。
 */
function installFakeFrames() {
  const previous = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  };
  let pending = null;
  let nextHandle = 1;
  let clock = 0;
  let requests = 0;
  let cancels = 0;

  globalThis.requestAnimationFrame = (callback) => {
    requests += 1;
    pending = { handle: nextHandle++, callback };
    return pending.handle;
  };
  globalThis.cancelAnimationFrame = (handle) => {
    cancels += 1;
    if (pending && pending.handle === handle) pending = null;
  };

  return {
    get pending() {
      return pending !== null;
    },
    get requests() {
      return requests;
    },
    get cancels() {
      return cancels;
    },
    /** 推进一帧。没有 pending 就什么都不做，和真实 rAF 一样。 */
    advance(stepMs = FRAME_MS) {
      clock += stepMs;
      const frame = pending;
      pending = null;
      frame?.callback(clock);
    },
    run(maxFrames, stepMs = FRAME_MS) {
      let frames = 0;
      while (pending && frames < maxFrames) {
        this.advance(stepMs);
        frames += 1;
      }
      return frames;
    },
    restore() {
      globalThis.requestAnimationFrame = previous.request;
      globalThis.cancelAnimationFrame = previous.cancel;
    },
  };
}

async function withFakeFrames(run) {
  const frames = installFakeFrames();
  try {
    return await run(frames);
  } finally {
    frames.restore();
  }
}

async function withReducedMotion(run) {
  const previous = globalThis.matchMedia;
  globalThis.matchMedia = (query) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
  });
  try {
    return await run();
  } finally {
    if (previous === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = previous;
  }
}

const { createSpring, createSpring2D, jumpAllSpringsToRest } = await import(
  "../src/lib/motion/spring.ts"
);
const { createPointerVelocityTracker } = await import(
  "../src/lib/motion/pointer-velocity.ts"
);

test("过阻尼弹簧单调收敛到目标，不越过它", async () => {
  await withFakeFrames((frames) => {
    const spring = createSpring(0, OVERDAMPED);
    const seen = [];
    spring.onChange((value) => seen.push(value));
    spring.setTarget(100);
    frames.run(600);

    assert.ok(seen.length > 10, `采样太少：${seen.length}`);
    for (let index = 1; index < seen.length; index += 1) {
      assert.ok(
        seen[index] >= seen[index - 1] - 1e-9,
        `第 ${index} 帧回退了：${seen[index - 1]} → ${seen[index]}`,
      );
      assert.ok(
        seen[index] <= 100 + 1e-9,
        `第 ${index} 帧越过了目标：${seen[index]}`,
      );
    }
    assert.equal(spring.current, 100);
    assert.equal(spring.settled, true);
  });
});

test("默认档（欠阻尼）会过冲，但收敛并精确落在目标上", async () => {
  await withFakeFrames((frames) => {
    const spring = createSpring(0, DEFAULT_CONFIG);
    const peak = { value: 0 };
    spring.onChange((value) => {
      peak.value = Math.max(peak.value, value);
    });
    spring.setTarget(100);

    assert.equal(spring.settled, false, "setTarget 之后应当处于未收敛态");
    const used = frames.run(600);

    // 过冲正是「有物理」的签名：这一档不是 ease-out，是弹簧。
    assert.ok(peak.value > 100, `默认档没有过冲，peak=${peak.value}`);
    assert.equal(spring.settled, true);
    assert.equal(spring.current, 100, "收敛后必须精确等于目标，不能停在附近");
    assert.equal(spring.velocity, 0);
    assert.ok(used < 200, `收敛太慢，用了 ${used} 帧`);
  });
});

test("settled 之后 rAF 必须停：既不再请求，也没有挂起的帧", async () => {
  await withFakeFrames((frames) => {
    const spring = createSpring(0, DEFAULT_CONFIG);
    spring.setTarget(50);
    frames.run(600);

    assert.equal(spring.settled, true);
    assert.equal(frames.pending, false, "收敛后仍有挂起的 rAF");
    const settledRequests = frames.requests;
    frames.advance();
    assert.equal(
      frames.requests,
      settledRequests,
      "收敛后 driver 还在空转请求新帧",
    );
  });
});

test("jumpToRest 立刻落到终态并当场停掉 rAF", async () => {
  await withFakeFrames((frames) => {
    const spring = createSpring(0, DEFAULT_CONFIG);
    spring.setTarget(320);
    frames.run(3);
    assert.ok(spring.current > 0 && spring.current < 320, "应当正在半路上");
    assert.equal(frames.pending, true);

    spring.jumpToRest();

    assert.equal(spring.current, 320);
    assert.equal(spring.velocity, 0);
    assert.equal(spring.settled, true);
    assert.equal(frames.pending, false, "jumpToRest 之后 rAF 没有停");
  });
});

test("多个弹簧共用同一个 driver：一帧只请求一次 rAF", async () => {
  await withFakeFrames((frames) => {
    const springs = Array.from({ length: 6 }, (_, index) =>
      createSpring(index, DEFAULT_CONFIG),
    );
    for (const spring of springs) spring.setTarget(spring.current + 200);

    // 六个弹簧、六次 setTarget，driver 只应该有一个挂起的帧。
    assert.equal(frames.requests, 1, "每个弹簧各自起了一个 rAF");
    const before = frames.requests;
    frames.advance();
    assert.equal(
      frames.requests - before,
      1,
      "一帧推进之后请求了不止一个后续帧",
    );

    frames.run(600);
    for (const spring of springs) assert.equal(spring.settled, true);
    assert.equal(frames.pending, false);
  });
});

test("掉帧不弹飞：一帧 2 秒与逐帧推进落到同一个终态", async () => {
  const settleWith = (stepMs, maxFrames) =>
    withFakeFrames((frames) => {
      const spring = createSpring(0, DEFAULT_CONFIG);
      let extreme = 0;
      spring.onChange((value) => {
        extreme = Math.max(extreme, Math.abs(value));
      });
      spring.setTarget(100);
      frames.run(maxFrames, stepMs);
      return { current: spring.current, settled: spring.settled, extreme };
    });

  const smooth = await settleWith(FRAME_MS, 600);
  const stalled = await settleWith(2000, 600);

  assert.equal(smooth.settled, true);
  assert.equal(stalled.settled, true);
  assert.equal(stalled.current, 100);
  // 显式积分器在 dt=2s 时会指数爆炸；固定子步长 + 单帧封顶就是为了这个。
  assert.ok(
    stalled.extreme < 200,
    `掉帧后弹飞了，极值 ${stalled.extreme}`,
  );
});

test("可打断：动画中途 set() 接管，速度不丢、rAF 让位给指针", async () => {
  await withFakeFrames((frames) => {
    const spring = createSpring(0, DEFAULT_CONFIG);
    spring.setTarget(400);
    frames.run(5);
    const midway = spring.current;
    assert.ok(midway > 0 && midway < 400);

    spring.set(midway + 30);

    assert.equal(frames.pending, false, "set() 之后弹簧仍在自己跑，会和指针打架");
    assert.equal(spring.current, midway + 30);

    // 松手：从当前位置继续，而不是从 0 或从原目标重来。
    spring.setTarget(0);
    assert.equal(spring.settled, false);
    frames.run(600);
    assert.equal(spring.current, 0);
  });
});

test("setVelocity 注入的初速度真的会产生运动与过冲", async () => {
  await withFakeFrames((frames) => {
    const spring = createSpring(0, DEFAULT_CONFIG);
    let peak = 0;
    spring.onChange((value) => {
      peak = Math.max(peak, value);
    });

    // 目标就是当前值：没有位移驱动，动起来的唯一原因就是注入的速度。
    spring.setVelocity(900);
    assert.equal(spring.settled, false);
    frames.run(600);

    assert.ok(peak > 20, `注入速度没有产生位移，peak=${peak}`);
    assert.equal(spring.current, 0);
    assert.equal(spring.settled, true);
    assert.equal(frames.pending, false);
  });
});

test("reduced-motion 下 setTarget 等价 jumpToRest，一帧都不跑", async () => {
  await withReducedMotion(() =>
    withFakeFrames((frames) => {
      const spring = createSpring(0, DEFAULT_CONFIG);
      const seen = [];
      spring.onChange((value) => seen.push(value));

      spring.setTarget(240);

      assert.equal(spring.current, 240);
      assert.equal(spring.settled, true);
      assert.deepEqual(seen, [240], "降级态应当只发一次终值");
      assert.equal(frames.requests, 0, "reduced-motion 下不许请求任何一帧");
    }),
  );
});

test("createSpring2D 两轴共用一个 entry，每帧只通知一次", async () => {
  await withFakeFrames((frames) => {
    const spring = createSpring2D({ x: 0, y: 0 }, DEFAULT_CONFIG);
    let notifications = 0;
    spring.onChange(() => {
      notifications += 1;
    });
    spring.setTarget({ x: 120, y: -80 });

    frames.advance();
    assert.equal(notifications, 1, "一帧通知了不止一次，调用方会写两遍 transform");

    frames.run(600);
    assert.deepEqual(spring.current, { x: 120, y: -80 });
    assert.deepEqual(spring.velocity, { x: 0, y: 0 });
    assert.equal(frames.pending, false);
  });
});

test("createSpring2D 的 jumpToRest 两轴一起落地", async () => {
  await withFakeFrames((frames) => {
    const spring = createSpring2D({ x: 10, y: 10 }, DEFAULT_CONFIG);
    spring.setTarget({ x: 200, y: 300 });
    frames.run(3);
    spring.jumpToRest();

    assert.deepEqual(spring.current, { x: 200, y: 300 });
    assert.equal(frames.pending, false);
  });
});

test("__leoMotionJumpAllToRest 的底座：jumpAllSpringsToRest 按停全场", async () => {
  await withFakeFrames((frames) => {
    const one = createSpring(0, DEFAULT_CONFIG);
    const two = createSpring2D({ x: 0, y: 0 }, DEFAULT_CONFIG);
    one.setTarget(500);
    two.setTarget({ x: 500, y: 500 });
    frames.run(2);

    jumpAllSpringsToRest();

    assert.equal(one.current, 500);
    assert.deepEqual(two.current, { x: 500, y: 500 });
    assert.equal(frames.pending, false, "全场按停之后 rAF 必须一起停");
  });
});

test("指针速度追踪器取窗口两端，不被最后一次微小回缩带偏", () => {
  const tracker = createPointerVelocityTracker();
  assert.deepEqual(tracker.velocity(), { x: 0, y: 0 }, "样本不足时必须是 0");

  // 40ms 里向右走了 400px = 10000 px/s，被上限压到 6000。
  tracker.sample(0, 0, 1000);
  tracker.sample(200, 0, 1020);
  tracker.sample(400, 0, 1040);
  assert.equal(tracker.velocity().x, 6000);

  const steady = createPointerVelocityTracker();
  for (let index = 0; index <= 5; index += 1) {
    steady.sample(index * 10, index * -5, 2000 + index * 10);
  }
  // 50ms 走 50px → 1000 px/s；纵向 -25px → -500 px/s。
  assert.equal(Math.round(steady.velocity().x), 1000);
  assert.equal(Math.round(steady.velocity().y), -500);

  // 松手前的一次 2px 回缩不该把方向翻过来。
  steady.sample(48, -25, 2055);
  assert.ok(
    steady.velocity().x > 0,
    `最后一点回缩把速度带成了 ${steady.velocity().x}`,
  );

  steady.reset();
  assert.deepEqual(steady.velocity(), { x: 0, y: 0 });
});

test("速度追踪器丢掉窗口外的样本，停顿之后不吐陈旧速度", () => {
  const tracker = createPointerVelocityTracker();
  tracker.sample(0, 0, 0);
  tracker.sample(300, 0, 30);
  // 停了 1 秒才松手：窗口里只剩下最后两点，速度应当接近 0。
  tracker.sample(300, 0, 1030);
  assert.ok(
    Math.abs(tracker.velocity().x) < 320,
    `停顿之后仍报出 ${tracker.velocity().x} px/s`,
  );
});

test("原语不碰 DOM：spring.ts 与 pointer-velocity.ts 里没有任何 DOM 标识符", () => {
  // 用 AST 扫标识符，不用 grep：注释里写着「不碰 DOM」这类字样，
  // 正则会把说明文字也算成命中。
  const forbidden = new Set([
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "querySelector",
    "getBoundingClientRect",
    "getComputedStyle",
    "createElement",
    "addEventListener",
    "style",
    "classList",
    "MutationObserver",
    "ResizeObserver",
  ]);
  for (const relative of [
    "../src/lib/motion/spring.ts",
    "../src/lib/motion/pointer-velocity.ts",
  ]) {
    const file = sourcePath(relative);
    const parsed = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TS,
    );
    const hits = [];
    const walk = (node) => {
      if (ts.isIdentifier(node) && forbidden.has(node.text)) {
        hits.push(node.text);
      }
      ts.forEachChild(node, walk);
    };
    walk(parsed);
    assert.deepEqual(hits, [], `${relative} 里出现了 DOM 标识符：${hits}`);
  }
});

test("API 形状与 motion-system.md §规范二 逐字一致", () => {
  const spring = createSpring(0, DEFAULT_CONFIG);
  for (const member of [
    "set",
    "setTarget",
    "setVelocity",
    "onChange",
    "stop",
    "jumpToRest",
  ]) {
    assert.equal(typeof spring[member], "function", `SpringValue 缺 ${member}`);
  }
  assert.equal(typeof spring.current, "number");
  assert.equal(typeof spring.velocity, "number");
  assert.equal(typeof spring.settled, "boolean");

  const spring2d = createSpring2D({ x: 0, y: 0 }, DEFAULT_CONFIG);
  for (const member of ["set", "setTarget", "onChange", "stop", "jumpToRest"]) {
    assert.equal(
      typeof spring2d[member],
      "function",
      `Spring2DValue 缺 ${member}`,
    );
  }
  assert.deepEqual(Object.keys(spring2d.current), ["x", "y"]);

  const tracker = createPointerVelocityTracker();
  for (const member of ["sample", "velocity", "reset"]) {
    assert.equal(
      typeof tracker[member],
      "function",
      `PointerVelocityTracker 缺 ${member}`,
    );
  }

  // 不传 config 时用规范里的默认档（stiffness 210 / damping 20）。
  const defaulted = createSpring(5);
  assert.equal(defaulted.current, 5);
  assert.equal(defaulted.settled, true);
});

test("onChange 返回退订函数，退订后不再收到帧", async () => {
  await withFakeFrames((frames) => {
    const spring = createSpring(0, DEFAULT_CONFIG);
    let count = 0;
    const unsubscribe = spring.onChange(() => {
      count += 1;
    });
    spring.setTarget(100);
    frames.advance();
    const afterFirst = count;
    assert.ok(afterFirst > 0);

    unsubscribe();
    frames.run(20);
    assert.equal(count, afterFirst, "退订之后仍在收帧");
    spring.jumpToRest();
  });
});

test("stop() 停在当前值上，不跳到目标", async () => {
  await withFakeFrames((frames) => {
    const spring = createSpring(0, DEFAULT_CONFIG);
    spring.setTarget(400);
    frames.run(4);
    const midway = spring.current;
    assert.ok(midway > 0 && midway < 400);

    spring.stop();

    assert.equal(spring.current, midway, "stop() 不该改变当前值");
    assert.equal(spring.velocity, 0);
    assert.equal(spring.settled, true);
    assert.equal(frames.pending, false);
  });
});

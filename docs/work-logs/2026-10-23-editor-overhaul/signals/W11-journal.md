# W11 journal (one line per measured conclusion)

- 2026-10-23T05:09Z [实测] bootstrap OK; HEAD 377b212b; acceptance account has no video items yet.
- 2026-10-23T05:20Z [实测] LeoDev slot public URL hangs (no first byte in 120 s); :8095 gate answers in 0.12 s; :8098 session proxy holds 64/64 upstream sockets (`maxSockets: 64`). Signalled parent (`signals/W11-to-parent.md`).
- 2026-10-23T05:27Z [实测] parent raised the session-proxy pool to 512; slot answers again. Re-running scenarios.
- 2026-10-23T05:36Z [实测] uploaded fixtures: mp4 root 16cfec58-8240-4e9b-a74b-0a1c8e528724 (video, ord 1); png root 693393d6-ff34-446c-bf32-29f842271f13; mp3 root 292e3906-5df2-42cb-b539-671350215e20. First attempt hit "暂时无法加载我的库" once; Retry recovered.
- 2026-10-23T05:55Z [实测] panel buttons in edit bar toggle active state but inspector host section.tool-detail invisible in /library carrier; preview went black after 410 on artifact-access grant (seed source exp 05:36:58Z).
- 2026-10-23T08:45Z [实测] R2: salvage on main; fixed title type, flip scale only when flipped, rotate helper moved into video-edit-bar.ts (W5 stub), carrier-contract palette test → timeline-theme; new tests/w11-video-edit-bar.test.mjs 9/9; carrier 23/23, v8 8/8, W5 10/10; i18n: no W11 keys missing.

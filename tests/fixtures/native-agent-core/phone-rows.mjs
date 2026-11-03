// Sanitized shapes/order from the 2026-11-03 two-reply phone archive.
// Session, message and turn IDs are synthetic; no account or private payloads.
const common = {program: 'claude', acp_session: 'phone-session'};
const turn = (message_id, turn_id) => ({...common, message_id, turn_id, intent: 'normal'});
const state = (identity, state) => ({...identity, t: 'prompt_state', state, uncertain: false, reason: ''});
const one = turn('phone-message-1', 'phone-turn-1');
const two = turn('phone-message-2', 'phone-turn-2');
export const phoneRowsFrames = [
  state(one, 'queued'),
  {...one, t: 'user_message', text: 'Reply OK.', ts: '2026-11-03T13:24:03.457009+00:00'},
  {...one, t: 'turn_start'},
  state(one, 'started_new_turn'),
  {...common, t: 'delta', turn_id: one.turn_id, text: 'OK'},
  {...one, t: 'done', stop_reason: 'end_turn'},
  {...state(two, 'queued'), t: 'prompt_ack'},
  state(two, 'queued'),
  state(two, 'queued'),
  {...two, t: 'user_message', text: 'Also reply OK2.', ts: '2026-11-03T13:25:00.976811+00:00'},
  {...two, t: 'turn_start'},
  state(two, 'started_new_turn'),
  {...common, t: 'delta', turn_id: two.turn_id, text: 'OK2'},
  {...two, t: 'done', stop_reason: 'end_turn'},
  {...common, t: 'done', stop_reason: 'cancelled'},
  {...common, t: 'done', stop_reason: 'cancelled'},
];

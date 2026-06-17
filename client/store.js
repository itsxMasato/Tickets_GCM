// Store reactivo mínimo: estado global + emit
const listeners = new Set();
let state = {
  user: null,
  notifications: [],
  unreadCount: 0,
};

export function getState() { return state; }

export function setState(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

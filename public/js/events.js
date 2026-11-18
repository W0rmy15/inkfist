// Client event bus. Sim code never touches this.
// Session emits each event once, the first time that frame runs forward.
// Rollback resimulates silently and does not emit again.

export function createBus() {
  const map = new Map();
  return {
    on(name, fn) {
      let set = map.get(name);
      if (!set) map.set(name, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    off(name, fn) {
      map.get(name)?.delete(fn);
    },
    emit(name, payload) {
      const set = map.get(name);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch (err) { console.error(err); }
      }
    },
  };
}

export const events = createBus();

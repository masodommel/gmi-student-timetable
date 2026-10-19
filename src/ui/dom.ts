export function $<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  return $<T>(`#${id}`);
}

export function closest<T extends Element>(target: EventTarget | null, selector: string): T | null {
  return target instanceof Element ? target.closest<T>(selector) : null;
}

export function on<T extends EventTarget, E extends Event = Event>(
  target: T,
  type: string,
  handler: (event: E) => void,
  options?: AddEventListenerOptions,
): void {
  target.addEventListener(type, handler as EventListener, options);
}

export function delegate<T extends HTMLElement>(
  root: Element,
  selector: string,
  type: string,
  handler: (element: T, event: Event) => void,
): void {
  on(root, type, (event) => {
    const element = closest<T>(event.target, selector);
    if (element) handler(element, event);
  });
}

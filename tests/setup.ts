/**
 * jsdom has no ResizeObserver; the uikit slider (reka-ui) constructs one on
 * mount. The tests assert attributes and emitted values, not layout, so an
 * inert stand-in is faithful.
 */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub

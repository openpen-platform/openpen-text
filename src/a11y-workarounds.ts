import type { Directive } from 'vue'

/*
 * Accessibility workarounds for three uikit controls (found with axe-core).
 * Remove each once the uikit fixes it.
 */

/**
 * The uikit `AppSlider` puts a passed `aria-label` on its outer wrapper, while
 * the focusable element a screen reader announces is the inner thumb
 * (`role="slider"`), which stays unnamed (axe: `aria-input-field-name`).
 * Put this directive on an element wrapping one slider: `v-slider-name="label"`.
 */
function applySliderName(el: HTMLElement, name: string | undefined): void {
  const thumb = el.querySelector('[role="slider"]')
  if (!thumb) return
  if (name) thumb.setAttribute('aria-label', name)
  else thumb.removeAttribute('aria-label')
}

export const vSliderName: Directive<HTMLElement, string> = {
  mounted: (el, binding) => {
    applySliderName(el, binding.value)
    // The thumb can render a tick after the wrapper; retry once.
    void Promise.resolve().then(() => applySliderName(el, binding.value))
  },
  updated: (el, binding) => applySliderName(el, binding.value),
}

/**
 * The uikit `AppToggle` renders `role="switch"` together with `aria-pressed`,
 * which a switch may not carry (axe: `aria-allowed-attr`, critical); the
 * state is already announced through `aria-checked`. Put this directive on an
 * element wrapping one toggle: `v-switch-state`.
 */
function dropPressed(el: HTMLElement): void {
  el.querySelector('[role="switch"]')?.removeAttribute('aria-pressed')
}

export const vSwitchState: Directive<HTMLElement> = {
  mounted: (el) => {
    dropPressed(el)
    void Promise.resolve().then(() => dropPressed(el))
  },
  updated: (el) => dropPressed(el),
}

/**
 * The uikit `AppSelect` trigger is an icon-and-value button with no accessible
 * name of its own (axe: `button-name`, critical). Name it from the field
 * label. Put this directive on an element wrapping one select:
 * `v-select-name="label"`.
 */
function applySelectName(el: HTMLElement, name: string | undefined): void {
  const trigger = el.querySelector('.openpen-select-trigger')
  if (!trigger) return
  if (name) trigger.setAttribute('aria-label', name)
  else trigger.removeAttribute('aria-label')
}

export const vSelectName: Directive<HTMLElement, string> = {
  mounted: (el, binding) => {
    applySelectName(el, binding.value)
    void Promise.resolve().then(() => applySelectName(el, binding.value))
  },
  updated: (el, binding) => applySelectName(el, binding.value),
}

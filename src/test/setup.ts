import '@testing-library/jest-dom'

// jsdom implements neither Range API used by CodeMirror to measure text
// layout — without these, any test that types into (or even just mounts) a
// CodeMirror editor throws "getClientRects is not a function" from an
// animation-frame callback outside the test body itself.
Range.prototype.getBoundingClientRect = (): DOMRect => ({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  toJSON: () => ({})
})
Range.prototype.getClientRects = (): DOMRectList =>
  ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as DOMRectList

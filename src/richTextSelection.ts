export type InlineColorProperty = 'color' | 'backgroundColor';

export function applyInlineColor(range: Range, property: InlineColorProperty, value: string) {
  const wrapper = document.createElement('span');
  wrapper.style[property] = value;

  const fragment = range.extractContents();
  fragment.querySelectorAll<HTMLElement>('*').forEach((element) => {
    element.style[property] = '';
    if (!element.getAttribute('style')) element.removeAttribute('style');
  });
  wrapper.appendChild(fragment);
  range.insertNode(wrapper);

  const nextRange = document.createRange();
  nextRange.selectNodeContents(wrapper);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
  return nextRange;
}

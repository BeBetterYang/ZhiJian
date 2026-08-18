import type MindMap from 'simple-mind-map';
import type { MindMapNode } from 'simple-mind-map';

/**
 * The `node_text_edit_change` payload emitted by simple-mind-map's RichText plugin
 * (see plugins/RichText.js) and TextEdit while a node is being edited.
 */
export interface NodeTextEditChange {
  node?: MindMapNode;
  text?: string;
}

/** A debounced resizer that also exposes `cancel()` for teardown. */
export type EditingNodeResizer = ((...args: unknown[]) => void) & {
  cancel: () => void;
};

// Native node internals we drive during a live edit. These all exist on every
// MindMapNode (core/render/node/*.js); we only surface the members we touch. The
// sequence below mirrors Render.onNodeTextEditChange (core/render/Render.js) except
// it stays node-local instead of running a full-tree mindMap.render().
type EditingNode = MindMapNode & {
  _textData: unknown;
  createTextNode: (text: string) => unknown;
  getNodeRect: () => { width: number; height: number };
  width: number;
  height: number;
  layout: () => void;
  update: (forceRender?: boolean) => void;
};

type EditingRenderer = {
  textEdit: { updateTextEditNode: () => void };
};

/**
 * Build a node-local resizer for `node_text_edit_change`.
 *
 * simple-mind-map's built-in realtime handler (bound when
 * `openRealtimeRenderOnNodeTextEdit` is on) regrows the edited node from the live
 * editor text and then calls `mindMap.render()` — a full-tree layout — on every
 * debounced change, so the whole map shifts while typing. This mirrors the useful
 * part (regrow the edited node + realign the editor overlay) but deliberately omits
 * the tree render: only the edited node changes size mid-edit. The single full
 * layout happens once on edit end (RichText.hideEditText → SET_NODE_TEXT → render).
 *
 * It never writes to the store and never touches editor content or selection, so
 * IME composition, rich-text formats, and highlight/selection are unaffected.
 */
export function createEditingNodeResizer(
  instance: MindMap,
  wait = 100,
): EditingNodeResizer {
  const renderer = instance.renderer as unknown as EditingRenderer;

  const run = (...args: unknown[]) => {
    const { node, text } = (args[0] ?? {}) as NodeTextEditChange;
    if (!node || typeof text !== 'string') return;
    const editingNode = node as EditingNode;
    try {
      // Size from the live editor text (not the committed node data).
      editingNode._textData = editingNode.createTextNode(text);
      const { width, height } = editingNode.getNodeRect(); // also refreshes _rectInfo
      editingNode.width = width;
      editingNode.height = height;
      editingNode.layout(); // re-lay this node's own content at the new size
      editingNode.update(); // apply geometry to this node's group only
      renderer.textEdit.updateTextEditNode(); // realign the editor overlay
    } catch {
      // A debounced call can land after editing ends or the node is torn down.
      // A dropped resize frame is harmless: the next keystroke, or the single
      // full render on edit end, corrects the geometry.
    }
  };

  return debounce(run, wait);
}

// The edited node's rendered text lives at `_textData.node` — an SVG.js element
// whose `.node` is the underlying DOM `<g>` we restyle. simple-mind-map keeps this
// element mounted across renders-while-editing (it isn't rebuilt until edit ends),
// so a one-time style flip on entry sticks for the whole session.
type RealtimeEditInstance = MindMap & {
  richText?: {
    node?: (MindMapNode & { _textData?: { node?: { node?: SVGGraphicsElement } } }) | null;
  } | null;
};

/**
 * Keep the currently-edited node's own text laid-out-but-invisible during a live
 * edit, instead of `display:none`.
 *
 * With `openRealtimeRenderOnNodeTextEdit` on, `TextEdit.show` hides the node's SVG
 * text via `display:none` (core/render/TextEdit.js) so it doesn't double with the
 * transparent editor overlay. But that same overlay is re-positioned by
 * `RichText.updateTextEditNode`, which reads this element's `getBoundingClientRect()`
 * on every render-while-editing (triggered via `afterExecCommand → node_tree_render_end`,
 * TextEdit.js). A `display:none` element measures 0×0, so the overlay snaps to the
 * top-left corner — e.g. when a click commits the previously-edited node, or on the
 * bold-normalize command. Switching to `opacity:0` keeps the element measurable at
 * the node's real position (no drift) while staying invisible (no doubling).
 *
 * The tweak needs no teardown: on edit-end the node is no longer the current edit
 * node, so the next render rebuilds its text fresh with the normal opacity.
 *
 * Returns a `before_show_text_edit` handler — that event fires after `RichText.node`
 * is set and after the node's text was hidden, so the element is available to restyle.
 */
export function createEditingTextReveal(instance: MindMap): () => void {
  const richTextInstance = instance as RealtimeEditInstance;
  return () => {
    const dom = richTextInstance.richText?.node?._textData?.node?.node;
    if (!dom) return;
    dom.style.display = '';
    dom.style.opacity = '0';
  };
}

/** Trailing-edge debounce with a `cancel()` for teardown. Self-contained (no deps). */
function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: A) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

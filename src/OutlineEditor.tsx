import type { DocumentStore } from './features/editor/core';
import OutlineView from './features/editor/outline/OutlineView';

type Props = {
  store: DocumentStore;
};

export default function OutlineEditor({ store }: Props) {
  return <OutlineView store={store} />;
}

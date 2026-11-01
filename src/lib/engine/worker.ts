/// <reference lib="webworker" />
import { analyseRegion, type RegionInput } from "./bubbles";

self.onmessage = (e: MessageEvent<{ id: number; input: RegionInput }>) => {
  try {
    const result = analyseRegion(e.data.input);
    self.postMessage({ id: e.data.id, result });
  } catch (err) {
    self.postMessage({ id: e.data.id, error: (err as Error).message });
  }
};

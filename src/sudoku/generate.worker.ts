import { generate, type Level } from './generate';

/** 문제 만들기는 수백 ms까지 걸릴 수 있어 화면이 멈추지 않게 따로 돌린다 */
self.onmessage = (e: MessageEvent<{ level: Level }>) => {
  self.postMessage(generate(e.data.level));
};

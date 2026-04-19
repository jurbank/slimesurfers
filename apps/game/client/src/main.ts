import { JoinOverlay } from "./ui/JoinOverlay.ts";
import { MatchScene } from "./scenes/matchScene.ts";

const scene = new MatchScene();
const skipJoinScreen = import.meta.env.DEV && import.meta.env.VITE_SKIP_JOIN_SCREEN === "true";
const devAutoJoinRetryMs = 1000;

scene.start();

const getDevPlayerName = (): string => {
  const storageKey = "splat.devPlayerName";
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const suffix = crypto.randomUUID().slice(0, 6);
  const name = `Dev-${suffix}`;
  sessionStorage.setItem(storageKey, name);
  return name;
};

const connect = async (name: string, onError: () => void): Promise<boolean> => {
  try {
    await scene.connect(name);
    return true;
  } catch (err) {
    console.error(err);
    onError();
    return false;
  }
};

if (skipJoinScreen) {
  let retryTimeout: number | null = null;
  let reconnecting = false;

  const scheduleDevAutoJoin = (): void => {
    if (retryTimeout !== null || reconnecting) return;
    retryTimeout = window.setTimeout(() => {
      retryTimeout = null;
      void devAutoJoin();
    }, devAutoJoinRetryMs);
  };

  const devAutoJoin = async (): Promise<void> => {
    reconnecting = true;
    const connected = await connect(getDevPlayerName(), () => {
      console.warn("Could not connect. Is the server running? Retrying...");
    });
    reconnecting = false;
    if (!connected) scheduleDevAutoJoin();
  };

  scene.onDisconnect(() => {
    console.warn("Disconnected from game server. Retrying...");
    scheduleDevAutoJoin();
  });
  void devAutoJoin();
} else {
  const overlay = new JoinOverlay();

  scene.onDisconnect(() => overlay.show("Disconnected. Try rejoining."));

  overlay.onJoin(async (name) => {
    overlay.setConnecting();
    const connected = await connect(name, () => {
      overlay.show("Could not connect. Is the server running?");
    });
    if (connected) overlay.hide();
  });
}

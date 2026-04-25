import { JoinOverlay } from "./ui/JoinOverlay.ts";
import { MatchScene } from "./scenes/matchScene.ts";
import { colyseusClient } from "./network/colyseusClient.ts";
import { getOrCreatePlayerUuid } from "./network/supabaseClient.ts";

const scene = new MatchScene();
const skipJoinScreen = import.meta.env.DEV && import.meta.env.VITE_SKIP_JOIN_SCREEN === "true";
const playerUuidPromise = getOrCreatePlayerUuid();
const devAutoJoinRetryMs = 1000;

scene.start();

const overlay = skipJoinScreen ? null : new JoinOverlay();

const getDevPlayerName = (): string => {
  const storageKey = "splat.devPlayerName";
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const suffix = crypto.randomUUID().slice(0, 6);
  const name = `Dev-${suffix}`;
  sessionStorage.setItem(storageKey, name);
  return name;
};

const connect = async (name: string, colorIndex: number, onError: () => void): Promise<boolean> => {
  try {
    const playerUuid = await playerUuidPromise;
    await scene.connect(name, colorIndex, playerUuid);
    return true;
  } catch (err) {
    console.error(err);
    onError();
    return false;
  }
};

// Start preloading immediately
void scene
  .preload((progress) => {
    overlay?.setProgress(progress);
  })
  .then(() => {
    if (skipJoinScreen) {
      void startDevAutoJoin();
    }
  });

async function startDevAutoJoin(): Promise<void> {
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
    const connected = await connect(getDevPlayerName(), 0, () => {
      console.warn("Could not connect. Is the server running? Retrying...");
    });
    reconnecting = false;
    if (!connected) scheduleDevAutoJoin();
  };

  scene.onDisconnect(() => {
    console.warn("Disconnected from game server. Retrying...");
    scheduleDevAutoJoin();
  });
  await devAutoJoin();
}

if (!skipJoinScreen && overlay) {
  let pollInterval: number | null = null;

  const refreshTakenColors = async (): Promise<void> => {
    try {
      const res = await colyseusClient.http.get<{ takenColorIndices: number[] }>("/colors");
      overlay.setTakenColorIndices(res.data.takenColorIndices ?? []);
    } catch {
      // server not up yet — all colors available
    }
  };

  const startPolling = (): void => {
    if (pollInterval !== null) return;
    void refreshTakenColors();
    pollInterval = window.setInterval(() => void refreshTakenColors(), 2000);
  };

  const stopPolling = (): void => {
    if (pollInterval === null) return;
    clearInterval(pollInterval);
    pollInterval = null;
  };

  startPolling();

  scene.onDisconnect(() => {
    scene.setEmoteToggleVisible(false);
    overlay.show("Disconnected. Try rejoining.");
    startPolling();
  });

  overlay.onJoin(async (name, colorIndex) => {
    stopPolling();
    overlay.setConnecting();
    const connected = await connect(name, colorIndex, () => {
      overlay.show("Could not connect. Is the server running?");
      startPolling();
    });
    if (connected) {
      overlay.hide();
      scene.requestPointerCapture();
      scene.setEmoteToggleVisible(true);
      scene.showHint("Press E to surf");
      setTimeout(() => scene.showHint("Surf on your slime to go faster"), 7000);
    }
  });
}

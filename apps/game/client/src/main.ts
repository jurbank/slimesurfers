import { JoinOverlay } from "./ui/JoinOverlay.ts";
import { MatchScene } from "./scenes/matchScene.ts";

const overlay = new JoinOverlay();
const scene = new MatchScene();

scene.onDisconnect(() => overlay.show("Disconnected. Try rejoining."));
scene.start();

overlay.onJoin(async (name) => {
  overlay.setConnecting();
  try {
    await scene.connect(name);
    overlay.hide();
  } catch (err) {
    console.error(err);
    overlay.show("Could not connect. Is the server running?");
  }
});

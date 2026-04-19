export class JoinOverlay {
  private readonly root: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private readonly joinBtn: HTMLButtonElement;
  private readonly statusText: HTMLParagraphElement;

  constructor() {
    this.root = document.createElement("div");
    Object.assign(this.root.style, {
      position: "fixed",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#080818",
      zIndex: "20",
      fontFamily: "sans-serif",
      color: "#fff",
      flexDirection: "column",
      gap: "12px",
    });

    const title = document.createElement("h1");
    title.textContent = "SPLAT";
    Object.assign(title.style, { margin: "0 0 8px", fontSize: "2.5rem", letterSpacing: "0.15em" });

    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.placeholder = "Enter your name";
    this.nameInput.maxLength = 20;
    Object.assign(this.nameInput.style, {
      padding: "10px 16px",
      fontSize: "1rem",
      borderRadius: "6px",
      border: "2px solid #444",
      background: "#111",
      color: "#fff",
      outline: "none",
      width: "220px",
      boxSizing: "border-box",
    });

    this.joinBtn = document.createElement("button");
    this.joinBtn.textContent = "JOIN";
    Object.assign(this.joinBtn.style, {
      padding: "10px 32px",
      fontSize: "1rem",
      fontWeight: "bold",
      borderRadius: "6px",
      border: "none",
      background: "#00e5ff",
      color: "#000",
      cursor: "pointer",
      letterSpacing: "0.1em",
    });

    this.statusText = document.createElement("p");
    this.statusText.style.fontSize = "0.85rem";
    this.statusText.style.color = "#888";
    this.statusText.textContent = "";

    this.root.append(title, this.nameInput, this.joinBtn, this.statusText);
    document.body.appendChild(this.root);
  }

  onJoin(callback: (name: string) => void): void {
    const submit = (): void => {
      const name = this.nameInput.value.trim() || `Player${Math.floor(Math.random() * 1000)}`;
      callback(name);
    };
    this.joinBtn.addEventListener("click", submit);
    this.nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  }

  setConnecting(): void {
    this.joinBtn.disabled = true;
    this.joinBtn.textContent = "Connecting…";
    this.statusText.textContent = "";
  }

  show(message = ""): void {
    this.root.style.display = "flex";
    this.statusText.textContent = message;
    this.joinBtn.disabled = false;
    this.joinBtn.textContent = "JOIN";
  }

  hide(): void {
    this.root.style.display = "none";
    this.showClickHint();
  }

  private showClickHint(): void {
    const hint = document.createElement("div");
    hint.textContent = "Click anywhere in the game to capture mouse — Esc to release";
    Object.assign(hint.style, {
      position: "fixed",
      bottom: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(0,0,0,0.6)",
      color: "#aaa",
      fontSize: "0.8rem",
      padding: "6px 14px",
      borderRadius: "4px",
      pointerEvents: "none",
      zIndex: "10",
      transition: "opacity 1s",
    });
    document.body.appendChild(hint);
    // Fade out after 4 s
    setTimeout(() => {
      hint.style.opacity = "0";
      setTimeout(() => hint.remove(), 1000);
    }, 4000);
  }
}

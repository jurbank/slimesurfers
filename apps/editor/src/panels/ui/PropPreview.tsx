import { useEffect, useState } from "react";
import * as THREE from "three";
import { createPropPreviewObject } from "../../tools/props/PropGeometries.ts";

interface PropPreviewProps {
  propId: string;
}

export function PropPreview({ propId }: PropPreviewProps) {
  const [imgData, setImgData] = useState<string | null>(null);

  useEffect(() => {
    // Generate a preview image once on mount
    const width = 128;
    const height = 128;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    const prop = createPropPreviewObject(propId);
    scene.add(prop);

    // Position camera based on prop type
    if (propId.includes("Tree")) {
      camera.position.set(5, 4, 8);
      camera.lookAt(0, 2, 0);
    } else if (propId === "ramp") {
      camera.position.set(4, 3, 5);
      camera.lookAt(0, 0.5, 0);
    } else if (propId === "mushroom") {
      camera.position.set(2, 2, 3);
      camera.lookAt(0, 0.3, 0);
    } else if (propId === "cactus") {
      camera.position.set(3, 3, 4);
      camera.lookAt(0, 0.9, 0);
    } else if (propId === "bush") {
      camera.position.set(2, 2, 3);
      camera.lookAt(0, 0.4, 0);
    } else if (propId === "flower") {
      camera.position.set(2, 2, 3);
      camera.lookAt(0, 0.4, 0);
    } else {
      camera.position.set(5, 5, 5);
      camera.lookAt(0, 0, 0);
    }

    renderer.render(scene, camera);
    setImgData(renderer.domElement.toDataURL());

    // Cleanup
    renderer.dispose();
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }, [propId]);

  if (!imgData) {
    return <div className="w-16 h-16 bg-zinc-800 rounded animate-pulse" />;
  }

  return <img src={imgData} alt={propId} className="w-16 h-16 object-contain" />;
}

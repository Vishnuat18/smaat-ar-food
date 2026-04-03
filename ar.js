const urlParams = new URLSearchParams(window.location.search);
const selectedDish = urlParams.get('dish') || "egg";

const models = {
  egg: "models/egg.glb",
  burger: "models/burger.glb",
  pizza: "models/pizza.glb"
};

async function startAR() {
  const mindarThree = new window.MINDAR.IMAGE.MindARThree({
    container: document.body,
    imageTargetSrc: './targets.mind',
  });

  const { renderer, scene, camera } = mindarThree;

  // Light
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  // Anchor
  const anchor = mindarThree.addAnchor(0);

  // Load model
  const loader = new THREE.GLTFLoader();

  loader.load(models[selectedDish], (gltf) => {
    const model = gltf.scene;

    model.scale.set(0.6, 0.6, 0.6);
    model.position.set(0, 0, 0);

    anchor.group.add(model);
  });

  await mindarThree.start();

  renderer.setAnimationLoop(() => {
    renderer.render(scene, camera);
  });
}

startAR();
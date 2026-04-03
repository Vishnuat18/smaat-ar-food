import * as THREE from 'https://cdn.skypack.dev/three@0.152.0';
import { ARButton } from 'https://cdn.skypack.dev/three/examples/jsm/webxr/ARButton.js';
import { GLTFLoader } from 'https://cdn.skypack.dev/three/examples/jsm/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'https://cdn.skypack.dev/three/examples/jsm/renderers/CSS2DRenderer.js';

let camera, scene, renderer, labelRenderer;
let controller;
let reticle;
let model;
let hitTestSource = null;
let hitTestSourceRequested = false;

const ingredients = [
  { name: 'Tomato', benefit: 'Vitamin C & Antioxidants', position: [0.1, 0.05, 0.1] },
  { name: 'Onion', benefit: 'Digestion & Heart Health', position: [-0.1, 0.08, -0.05] },
  { name: 'Basmati Rice', benefit: 'Complex Carbs & Energy', position: [0, 0, 0] }
];

const labels = [];
const lines = [];

init();

function init() {
  const container = document.getElementById('container');

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20);

  // WebGL Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.outputEncoding = THREE.sRGBEncoding;
  container.appendChild(renderer.domElement);

  // CSS2D Renderer for labels
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0px';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  // Lighting
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
  scene.add(light);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(0, 10, 0);
  scene.add(directionalLight);

  // Interaction: Controller (tap to place)
  controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // Reticle (placement indicator)
  const ringGeometry = new THREE.RingGeometry(0.08, 0.12, 32).rotateX(-Math.PI / 2);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xFFD700 });
  reticle = new THREE.Mesh(ringGeometry, ringMaterial);
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Load Model
  const loader = new GLTFLoader();
  loader.load('model/dish.glb', (gltf) => {
    model = gltf.scene;
    // Scale model (0.3 sounds right for a plate)
    model.scale.set(0.3, 0.3, 0.3);
    
    // Create ingredient overlays
    createOverlays();
  }, undefined, (error) => {
    console.error('An error happened', error);
  });

  // UI Listeners
  document.getElementById('start-ar-btn').addEventListener('click', () => {
    document.getElementById('intro-overlay').classList.add('fade-out');
    startARSession();
  });

  window.addEventListener('resize', onWindowResize);

  renderer.setAnimationLoop(render);
}

function createOverlays() {
  ingredients.forEach((item) => {
    // 1. Create HTML Label
    const div = document.createElement('div');
    div.className = 'ingredient-label';
    div.innerHTML = `
      <span class="name">${item.name}</span>
      <span class="benefit">${item.benefit}</span>
    `;
    
    const label = new CSS2DObject(div);
    // Relative position
    const pos = new THREE.Vector3(...item.position);
    // Offset label vertically
    label.position.set(pos.x, pos.y + 0.25, pos.z);
    label.visible = false;
    labels.push(label);

    // 2. Create Connector Line
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xFFD700, transparent: true, opacity: 0.5 });
    const points = [];
    points.push(new THREE.Vector3(pos.x, pos.y, pos.z));
    points.push(new THREE.Vector3(pos.x, pos.y + 0.2, pos.z));
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, lineMaterial);
    line.visible = false;
    lines.push(line);
  });
}

async function startARSession() {
  const sessionInit = { requiredFeatures: ['hit-test'] };
  try {
    const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
    renderer.xr.setSession(session);
    document.getElementById('ar-hud').classList.remove('hidden');
    document.getElementById('status-msg').innerText = 'Point at floor to place dish';
  } catch (err) {
    alert('WebXR not supported on this device/browser');
    console.error(err);
  }
}

function onSelect() {
  if (reticle.visible && model) {
    // We already have a dish? Re-place it or add new? 
    // User goal: "The model should remain fixed in real world"
    // Let's hide the old one or just move it.
    
    model.position.setFromMatrixPosition(reticle.matrix);
    
    // Add labels and lines to the model instead of scene so they move with it
    if (!model.parent) {
      scene.add(model);
      
      labels.forEach((label, i) => {
        model.add(label);
        label.visible = true;
      });
      
      lines.forEach((line) => {
        model.add(line);
        line.visible = true;
      });
    }

    document.getElementById('status-msg').innerText = 'Object Placed - Walk Around!';
    reticle.visible = false;
    hitTestSource = null; // Stop hit testing once placed? Or keep it?
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

function render(timestamp, frame) {
  if (frame) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    const session = renderer.xr.getSession();

    if (hitTestSourceRequested === false) {
      session.requestReferenceSpace('viewer').then((refSpace) => {
        session.requestHitTestSource({ space: refSpace }).then((source) => {
          hitTestSource = source;
        });
      });
      hitTestSourceRequested = true;
    }

    if (hitTestSource) {
      const hitTestResults = frame.getHitTestResults(hitTestSource);
      if (hitTestResults.length) {
        const hit = hitTestResults[0];
        const pose = hit.getPose(referenceSpace);
        reticle.visible = true;
        reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }
  }

  // Animation: Slight rotation for visual interest
  if (model && model.parent) {
    model.rotation.y += 0.005;
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
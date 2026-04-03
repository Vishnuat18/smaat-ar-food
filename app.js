import * as THREE from 'https://esm.sh/three@0.152.0';
import { GLTFLoader } from 'https://esm.sh/three@0.152.0/examples/jsm/loaders/GLTFLoader.js';
import { CSS2DRenderer, CSS2DObject } from 'https://esm.sh/three@0.152.0/examples/jsm/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'https://esm.sh/three@0.152.0/examples/jsm/controls/OrbitControls.js';

let camera, scene, renderer, labelRenderer, controls;
let controller;
let reticle;
let model;
let hitTestSource = null;
let hitTestSourceRequested = false;
let isARMode = false;

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
  camera.position.set(0, 0.5, 1);

  // WebGL Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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
  directionalLight.position.set(2, 5, 2);
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
  const progressText = document.getElementById('loading-progress');
  const startBtn = document.getElementById('start-ar-btn');

  console.log('Starting model load: model/dish.glb');

  loader.load('model/dish.glb', (gltf) => {
    console.log('Model loaded successfully!');
    model = gltf.scene;
    // Scale model (0.3 sounds right for a plate)
    model.scale.set(0.3, 0.3, 0.3);
    
    // Create ingredient overlays
    createOverlays();

    // Update UI
    progressText.innerText = '100%';
    const startBtn = document.getElementById('start-ar-btn');
    startBtn.innerText = 'ENTER AR DISH';
    startBtn.disabled = false;
    startBtn.classList.add('ready');

    // UI Listeners
    startBtn.addEventListener('click', () => {
      document.getElementById('intro-overlay').classList.add('fade-out');
      // Check if we already detected no support
      if (startBtn.getAttribute('data-ar-supported') === 'false') {
        startFallbackSession();
      } else {
        startARSession();
      }
    });

  }, (xhr) => {
    // onProgress callback
    if (xhr.lengthComputable) {
      const percent = Math.round((xhr.loaded / xhr.total) * 100);
      progressText.innerText = percent + '%';
      console.log(`Loading: ${percent}%`);
    } else {
      // In case content-length is missing
      progressText.innerText = 'Loading...';
    }
  }, (error) => {
    const startBtn = document.getElementById('start-ar-btn');
    console.error('GLTF Loader Error:', error);
    progressText.innerText = 'Error!';
    startBtn.innerText = 'RELOAD PAGE';
    startBtn.disabled = false;
    startBtn.onclick = () => window.location.reload();
  });

  // Pre-check AR Support on load
  checkARSupport();

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
    const pos = new THREE.Vector3(...item.position);
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

async function checkARSupport() {
  const startBtn = document.getElementById('start-ar-btn');
  const isSupported = await navigator.xr?.isSessionSupported('immersive-ar');
  
  if (!isSupported) {
    console.warn('WebXR not supported on this device');
    startBtn.setAttribute('data-ar-supported', 'false');
  } else {
    startBtn.setAttribute('data-ar-supported', 'true');
  }
}

async function startARSession() {
  const sessionInit = { 
    requiredFeatures: ['local-floor'],
    optionalFeatures: ['hit-test'] 
  };
  
  try {
    const session = await navigator.xr.requestSession('immersive-ar', sessionInit);
    renderer.xr.setSession(session);
    isARMode = true;
    document.getElementById('ar-hud').classList.remove('hidden');
    document.getElementById('status-msg').innerText = 'Scanning for surfaces...';
  } catch (err) {
    console.error('AR Session Start Error:', err);
    startFallbackSession();
  }
}

function startFallbackSession() {
  if (controls) return;
  isARMode = false;
  
  const hud = document.getElementById('ar-hud');
  hud.classList.remove('hidden');
  document.querySelector('.badge').innerText = '3D PREVIEW';
  document.getElementById('status-msg').innerText = 'WebXR Not Supported - Viewing 3D Mockup';

  scene.add(model);
  model.position.set(0, -0.1, 0);

  labels.forEach(label => {
    model.add(label);
    label.visible = true;
  });
  
  lines.forEach(line => {
    model.add(line);
    line.visible = true;
  });

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 2;
  
  camera.position.set(0.5, 0.5, 1);
  camera.lookAt(0, 0, 0);
}

function onSelect() {
  if (isARMode && reticle.visible && model) {
    model.position.setFromMatrixPosition(reticle.matrix);
    
    if (!model.parent) {
      scene.add(model);
      labels.forEach(label => { model.add(label); label.visible = true; });
      lines.forEach(line => { model.add(line); line.visible = true; });
    }

    document.getElementById('status-msg').innerText = 'Object Placed - Walk Around!';
    reticle.visible = false;
    hitTestSource = null;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

function render(timestamp, frame) {
  if (isARMode && frame) {
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

  if (model && model.parent) {
    if (isARMode) {
      model.rotation.y += 0.005;
    } else {
      if (controls) controls.update();
    }
  }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}


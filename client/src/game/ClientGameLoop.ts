import * as THREE from "three";
import { NetworkManager } from "../network/NetworkManager";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Material, Mesh, Object3D } from "three";
import { ClientPhysicsSystem } from "../physics/ClientPhysicsSystem";

export interface GameEntity {
  id: string;
  mesh: THREE.Mesh;
  lastState?: any;
  interpolation: {
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
    scale: THREE.Vector3;
  };
}

export class ClientGameLoop {
  private readonly FPS: number = 60;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private networkManager: NetworkManager;
  private physicsSystem: ClientPhysicsSystem;
  private entities: Map<string, GameEntity> = new Map();
  private lastUpdateTime: number = 0;
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private playerId: string = "";
  private ownedEntity: GameEntity | null = null;
  private cameraOffset = new THREE.Vector3(0, 15, 25);
  private inputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
  };
  private debugCallback: ((info: any) => void) | null = null;
  private inputSequenceNumber: number = 0;
  private pendingInputs: Array<{
    sequenceNumber: number;
    input: { velocity: { x: number; z: number }; jump: boolean };
    timestamp: number;
  }> = [];

  constructor(container: HTMLElement) {
    console.log("Creating new ClientGameLoop instance");

    // Initialize physics
    this.physicsSystem = new ClientPhysicsSystem();

    // Initialize Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    // Set up camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 15, 25);

    // Set up renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Set up controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI / 2.2; // Prevent camera from going below ground
    this.controls.target.set(0, 0, 0);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040, 1);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -25;
    directionalLight.shadow.camera.right = 25;
    directionalLight.shadow.camera.top = 25;
    directionalLight.shadow.camera.bottom = -25;

    this.scene.add(ambientLight, directionalLight);

    // Add a grid helper for reference
    const gridHelper = new THREE.GridHelper(40, 40, 0x444444, 0x222222);
    this.scene.add(gridHelper);

    // Initialize network manager
    this.networkManager = new NetworkManager({
      serverUrl: import.meta.env.VITE_SERVER_SOCKET_URL,
      reconnectInterval: 1000,
      maxReconnectAttempts: 5,
    });

    this.setupNetworkHandlers();
    this.setupInputHandlers();
    this.setupWindowResize();

    // Start the render loop
    this.isRunning = true;
    this.animate();
  }

  private setupNetworkHandlers(): void {
    console.log("Setting up network handlers");

    this.networkManager.on("connected", (data: { clientId: string }) => {
      console.log("Connected to game server with ID:", data.clientId);
      this.playerId = data.clientId;
      // Create player entity when connected
      this.networkManager.sendInput({
        velocity: { x: 0, z: 0 },
        jump: false,
      });
    });

    this.networkManager.on("disconnected", () => {
      console.log("Disconnected from game server");
      // Clear owned entity reference
      this.ownedEntity = null;
      this.playerId = "";

      // Clear entities on disconnect
      this.entities.forEach((entity) => {
        if (this.physicsSystem.isReady()) {
          this.physicsSystem.removeEntity(entity.id);
        }
        this.scene.remove(entity.mesh);
      });
      this.entities.clear();
    });

    this.networkManager.on("gameState", (state: any) => {
      this.updateGameState(state);
      // Forward debug info to the callback
      if (this.debugCallback && state.debug) {
        this.debugCallback(state);
      }
    });

    this.networkManager.on("playerJoined", (data: { clientId: string }) => {
      console.log(`Player ${data.clientId} joined`);
    });

    // Connect to server
    this.networkManager.connect();
  }

  private setupInputHandlers(): void {
    // Track input state
    this.inputState = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
    };

    // Handle keyboard events
    window.addEventListener("keydown", (event) => {
      this.handleKeyEvent(event.code, true);
      // event.preventDefault();
    });

    window.addEventListener("keyup", (event) => {
      this.handleKeyEvent(event.code, false);
      // event.preventDefault();
    });

    // Start input processing loop
    this.processInputs();
  }

  private handleKeyEvent(code: string, isDown: boolean): void {
    switch (code) {
      case "KeyW":
      case "ArrowUp":
        this.inputState.forward = isDown;
        break;
      case "KeyS":
      case "ArrowDown":
        this.inputState.backward = isDown;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.inputState.left = isDown;
        break;
      case "KeyD":
      case "ArrowRight":
        this.inputState.right = isDown;
        break;
      case "Space":
        this.inputState.jump = isDown;
        break;
    }
  }

  private processInputs = () => {
    // Calculate movement vector
    const velocity = {
      x: (this.inputState.right ? 1 : 0) - (this.inputState.left ? 1 : 0),
      z: (this.inputState.backward ? 1 : 0) - (this.inputState.forward ? 1 : 0),
    };

    // Normalize diagonal movement
    const length = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    if (length > 0) {
      velocity.x /= length;
      velocity.z /= length;
    }

    // Create input with sequence number
    const input = {
      sequenceNumber: this.inputSequenceNumber++,
      input: {
        velocity,
        jump: this.inputState.jump,
      },
      timestamp: Date.now(),
    };

    // Store input for reconciliation
    this.pendingInputs.push(input);

    // Apply physics if this is the local player
    const localPlayer = Array.from(this.entities.values()).find(
      (e) => e.id === `player-${this.playerId}`
    );

    if (localPlayer && this.physicsSystem.isReady()) {
      const MOVE_SPEED = 5;
      const JUMP_FORCE = 1;
      const MAX_VELOCITY = 10;

      const speed = Math.sqrt(
        velocity.x * velocity.x + velocity.z * velocity.z
      );
      if (speed > MAX_VELOCITY) {
        const scale = MAX_VELOCITY / speed;
        velocity.x *= scale;
        velocity.z *= scale;
      }

      // Set velocity for movement
      this.physicsSystem.setLinearVelocity(localPlayer.id, {
        x: velocity.x * MOVE_SPEED,
        z: velocity.z * MOVE_SPEED,
      });

      // Handle jumping
      if (
        this.inputState.jump &&
        this.physicsSystem.isGrounded(localPlayer.id)
      ) {
        this.physicsSystem.applyImpulse(localPlayer.id, {
          x: 0,
          y: JUMP_FORCE,
          z: 0,
        });
      }
    }

    // Send input to server with sequence number
    this.networkManager.sendInput({
      ...input.input,
      sequenceNumber: input.sequenceNumber,
    });

    // Schedule next input processing
    setTimeout(this.processInputs, 1000 / this.FPS);
  };

  private setupWindowResize(): void {
    const onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", onResize);
  }

  private updateGameState(state: any): void {
    const currentTime = Date.now();
    this.lastUpdateTime = currentTime;

    // Process each entity in the state
    state.entities.forEach((entityState: any) => {
      let entity = this.entities.get(entityState.networkId);

      if (!entity) {
        entity = this.createEntity(entityState);
        this.entities.set(entityState.networkId, entity);

        // If this is our player entity, store the reference
        if (entityState.networkId === `player-${this.playerId}`) {
          this.ownedEntity = entity;
          console.log("Found owned entity:", entity.id);
        }
      }

      // Only update physics for non-owned entities
      if (this.physicsSystem.isReady()) {
        this.physicsSystem.updateServerState(
          entityState.networkId,
          entityState
        );
      }

      // Store the last state
      entity.lastState = entityState;
    });

    // Remove entities that are no longer in the state
    const networkIds = new Set(state.entities.map((e: any) => e.networkId));
    for (const [id, entity] of this.entities) {
      if (!networkIds.has(id)) {
        if (this.physicsSystem.isReady()) {
          this.physicsSystem.removeEntity(id);
        }
        this.scene.remove(entity.mesh);
        this.entities.delete(id);

        // Clear owned entity reference if it was removed
        if (id === `player-${this.playerId}`) {
          this.ownedEntity = null;
        }
      }
    }
  }

  private createEntity(state: any): GameEntity {
    if (!state.render) {
      return {
        id: state.networkId,
        mesh: new THREE.Mesh(),
        interpolation: {
          position: new THREE.Vector3(),
          rotation: new THREE.Quaternion(),
          scale: new THREE.Vector3(),
        },
      };
    }

    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshPhongMaterial({
      color: state.render?.material?.color || 0xffffff,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    // Set initial transform
    if (state.transform) {
      // Create vectors for initial transform
      const position = new THREE.Vector3(
        state.transform.position.x,
        state.transform.position.y,
        state.transform.position.z
      );
      const rotation = new THREE.Quaternion(
        state.transform.rotation.x,
        state.transform.rotation.y,
        state.transform.rotation.z,
        state.transform.rotation.w
      );

      // Handle scale from both transform and render components
      const meshScale = state.render?.mesh?.scale || 1;
      const scale = new THREE.Vector3(
        state.transform.scale.x * meshScale,
        state.transform.scale.y * meshScale,
        state.transform.scale.z * meshScale
      );

      // Apply transform
      mesh.position.copy(position);
      mesh.quaternion.copy(rotation);
      mesh.scale.copy(scale);
    }

    this.scene.add(mesh);

    const entity: GameEntity = {
      id: state.networkId,
      mesh,
      lastState: state,
      interpolation: {
        position: mesh.position.clone(),
        rotation: mesh.quaternion.clone(),
        scale: mesh.scale.clone(),
      },
    };

    // Add to physics system if ready
    if (this.physicsSystem.isReady()) {
      const isStatic = state.physics?.isStatic || false;
      const useGravity = state.physics?.useGravity || true;
      const isClientAuthoritative =
        state.networkId === `player-${this.playerId}`;

      this.physicsSystem.addEntity(
        entity,
        isStatic,
        useGravity,
        isClientAuthoritative
      );
    }

    // If this is the client player, update camera target
    if (state.networkId.startsWith("player-")) {
      this.controls.target.copy(mesh.position);
    }

    return entity;
  }

  private interpolateEntities(deltaTime: number): void {
    const interpolationFactor = Math.min(1, deltaTime * 10);

    this.entities.forEach((entity) => {
      // Only interpolate non-owned entities
      if (entity.id !== `player-${this.playerId}`) {
        // Interpolate position
        entity.mesh.position.lerp(
          entity.interpolation.position,
          interpolationFactor
        );

        // Interpolate rotation
        entity.mesh.quaternion.slerp(
          entity.interpolation.rotation,
          interpolationFactor
        );

        // Interpolate scale
        entity.mesh.scale.lerp(entity.interpolation.scale, interpolationFactor);
      }
    });
  }

  private updateCamera(deltaTime: number): void {
    if (this.ownedEntity) {
      // Calculate desired camera position based on player position
      const targetPosition = this.ownedEntity.mesh.position.clone();
      const idealOffset = this.cameraOffset.clone();

      // Smoothly move camera to follow player
      const desiredPosition = targetPosition.clone().add(idealOffset);

      // Interpolate camera position
      this.camera.position.lerp(desiredPosition, deltaTime * 5);

      // Update orbit controls target
      this.controls.target.lerp(targetPosition, deltaTime * 5);
    }
  }

  private animate = (): void => {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(this.animate);

    const currentTime = Date.now();
    const deltaTime = (currentTime - this.lastUpdateTime) / 1000;
    this.lastUpdateTime = currentTime;

    // Update physics
    if (this.physicsSystem.isReady()) {
      this.physicsSystem.update();
    }

    // Update camera to follow owned entity
    this.updateCamera(deltaTime);

    // Update controls
    this.controls.update();

    // Interpolate entity positions (except owned entity)
    this.interpolateEntities(deltaTime);

    // Render the scene
    this.renderer.render(this.scene, this.camera);
  };

  public cleanup(): void {
    console.log("Cleaning up ClientGameLoop");
    this.isRunning = false;

    // Cancel animation frame
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Clean up physics
    this.physicsSystem.cleanup();

    // Clean up Three.js resources
    this.scene.traverse((object: Object3D) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material: Material) => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });

    this.renderer.dispose();

    // Clean up event listeners
    window.removeEventListener("resize", this.setupWindowResize);

    // Disconnect from server
    this.networkManager.disconnect();

    // Clear entities
    this.entities.clear();
  }

  public onDebugUpdate(callback: (info: any) => void): void {
    this.debugCallback = callback;
  }
}

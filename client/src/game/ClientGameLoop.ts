import * as THREE from "three";
import { NetworkManagerFactory, INetworkManager } from "../network/NetworkManagerFactory";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Material, Mesh, Object3D } from "three";
import { ClientPhysicsSystem } from "../physics/ClientPhysicsSystem";
import { NetworkMonitor } from "../components/NetworkMonitor";

export interface GameEntity {
  id: string;
  mesh: THREE.Mesh;
  lastState?: any;
  originalColor?: number; // Store the original color to prevent overwrites
}

export class ClientGameLoop {
  private readonly FPS: number = 60;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private networkManager: INetworkManager;
  private physicsSystem: ClientPhysicsSystem;
  private entities: Map<string, GameEntity> = new Map();
  private isRunning = false;
  private animationFrameId: number | null = null;
  private playerId = "";
  private ownedEntity: GameEntity | null = null;
  private cameraOffset = new THREE.Vector3(0, 15, 25);
  private inputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    rotateLeft: false,  // Q key
    rotateRight: false, // E key
  };
  private debugCallback: ((info: any) => void) | null = null;
  private networkMonitor: NetworkMonitor;
  private lastUpdateTime = 0;

  constructor(container: HTMLElement) {
    console.log("Creating new ClientGameLoop instance");

    // Initialize physics
    this.physicsSystem = new ClientPhysicsSystem();

    // Initialize Three.js
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x202020); // Dark grey instead of black

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
    console.log("Lights added to scene:", { ambientLight, directionalLight });

    // Add a grid helper for reference
    const gridHelper = new THREE.GridHelper(40, 40, 0x444444, 0x222222);
    this.scene.add(gridHelper);

    // Add a test cube to verify rendering is working
    const testGeometry = new THREE.BoxGeometry(2, 2, 2);
    const testMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    const testCube = new THREE.Mesh(testGeometry, testMaterial);
    testCube.position.set(5, 1, 0);
    testCube.castShadow = true;
    testCube.receiveShadow = true;
    this.scene.add(testCube);
    console.log("Test cube added to scene at position:", testCube.position);

    // Initialize network manager (using factory to support both WebSocket and Geckos.io)
    this.networkManager = NetworkManagerFactory.create({
      serverUrl: import.meta.env.VITE_SERVER_SOCKET_URL || "http://localhost:9208",
      reconnectInterval: 1000,
      maxReconnectAttempts: 5,
      useGeckos: true, // Switch to Geckos.io for UDP over WebRTC
    });

    // Initialize network monitor
    this.networkMonitor = new NetworkMonitor();

    this.setupNetworkHandlers();
    this.setupInputHandlers();
    this.setupWindowResize();
    this.setupNetworkMonitoring();

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
      console.log("Sending initial input to create player entity");
      this.networkManager.sendInput({
        velocity: { x: 0, z: 0 },
        rotation: 0,
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

    this.networkManager.onRaw((state: any) => {
      this.updateGameState(state);
      
      // Forward debug info to the callback
      if (this.debugCallback && state.debug) {
        this.debugCallback(state);
      }
    });

    this.networkManager.on("playerJoined", (data: { clientId: string }) => {
      console.log(`Player ${data.clientId} joined`);
    });
    
    this.networkManager.on("playerLeft", (data: { clientId: string }) => {
      console.log(`Player ${data.clientId} left`);
    });
    
    // Monitor latency for general network monitoring
    this.networkManager.on("latency", (latency: number) => {
      console.log(`Network latency updated: ${latency}ms`);
    });

    // Handle connection quality updates for monitoring
    this.networkManager.on("connectionQuality", (quality: any) => {
      console.log(`Connection quality: ${quality.connectionStrength} (latency: ${quality.latency.toFixed(1)}ms, jitter: ${quality.jitter.toFixed(1)}ms)`);
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
      rotateLeft: false,  // Q key
      rotateRight: false, // E key
    };

    // Handle keyboard events
    window.addEventListener("keydown", (event) => {
      this.handleKeyEvent(event.code, true);
    });

    window.addEventListener("keyup", (event) => {
      this.handleKeyEvent(event.code, false);
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
      case "KeyQ":
        this.inputState.rotateLeft = isDown;
        break;
      case "KeyE":
        this.inputState.rotateRight = isDown;
        break;
    }
  }

  private processInputs = () => {
    // Calculate movement vector
    const velocity = {
      x: (this.inputState.right ? 1 : 0) - (this.inputState.left ? 1 : 0),
      z: (this.inputState.backward ? 1 : 0) - (this.inputState.forward ? 1 : 0),
    };

    // Calculate rotation input
    const rotation = (this.inputState.rotateRight ? 1 : 0) - (this.inputState.rotateLeft ? 1 : 0);

    // Normalize diagonal movement
    const length = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
    if (length > 0) {
      velocity.x /= length;
      velocity.z /= length;
    }

    // Apply physics if this is the local player
    const localPlayer = Array.from(this.entities.values()).find(
      (e) => e.id === `player-${this.playerId}`
    );

    if (localPlayer && this.physicsSystem.isReady()) {
      const MOVE_SPEED = 5;
      const JUMP_FORCE = 1;
      const ROTATION_SPEED = 3; // Rotation speed in radians per second
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

      // Handle rotation
      this.physicsSystem.setAngularVelocity(localPlayer.id, {
        y: rotation * ROTATION_SPEED,
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

    // Send input to server
    this.networkManager.sendInput({
      velocity,
      rotation,
      jump: this.inputState.jump,
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
    // Validate that state exists and has entities
    if (!state || !state.entities || !Array.isArray(state.entities)) {
      console.warn('Received invalid game state:', state);
      return;
    }

    console.log('🎮 Processing game state with', state.entities.length, 'entities');

    // Process each entity in the state
    state.entities.forEach((entityState: any, index: number) => {
      console.log(`🔍 Processing entity ${index}:`, {
        networkId: entityState.networkId,
        hasTransform: !!entityState.transform,
        hasRender: !!entityState.render,
        hasPhysics: !!entityState.physics
      });

      // Clean up networkId (remove trailing spaces)
      const cleanNetworkId = entityState.networkId?.trim();
      if (!cleanNetworkId) {
        console.warn('Entity has empty networkId, skipping:', entityState);
        return;
      }

      let entity = this.entities.get(cleanNetworkId);

      if (!entity) {
        console.log(`✨ Creating new entity: ${cleanNetworkId}`);
        entity = this.createEntity({...entityState, networkId: cleanNetworkId});
        this.entities.set(cleanNetworkId, entity);

        // If this is our player entity, store the reference
        if (cleanNetworkId === `player-${this.playerId}`) {
          this.ownedEntity = entity;
          console.log("Found owned entity:", entity.id);
        }
      } else {
        console.log(`🔄 Updating existing entity: ${cleanNetworkId}`);
      }

      // Apply server state directly to all entities (no interpolation)
      this.updateEntityDirect(entity, {...entityState, networkId: cleanNetworkId});

      // Only update physics for non-owned entities
      if (this.physicsSystem.isReady()) {
        this.physicsSystem.updateServerState(
          cleanNetworkId,
          {...entityState, networkId: cleanNetworkId}
        );
      }

      // Store the last state
      entity.lastState = {...entityState, networkId: cleanNetworkId};
    });

    // Remove entities that are no longer in the state
    const networkIds = new Set(state.entities.map((e: any) => e.networkId?.trim()).filter(Boolean));
    for (const [id, entity] of this.entities) {
      if (!networkIds.has(id)) {
        console.log(`🗑️ Removing entity: ${id}`);
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

    console.log('🎮 Total entities in scene:', this.entities.size);
  }

  private updateEntityDirect(entity: GameEntity, entityState: any): void {
    // Apply transform directly from server state (no interpolation)
    if (entityState.transform) {
      entity.mesh.position.set(
        entityState.transform.position.x,
        entityState.transform.position.y,
        entityState.transform.position.z
      );
      entity.mesh.quaternion.set(
        entityState.transform.rotation.x,
        entityState.transform.rotation.y,
        entityState.transform.rotation.z,
        entityState.transform.rotation.w
      );

      // Handle scale from both transform and render components
      const meshScale = entityState.render?.mesh?.scale || 1;
      entity.mesh.scale.set(
        entityState.transform.scale.x * meshScale,
        entityState.transform.scale.y * meshScale,
        entityState.transform.scale.z * meshScale
      );
    }

    // Update material color directly if changed
    if (entityState.render?.material?.color && entity.mesh.material instanceof THREE.MeshPhongMaterial) {
      try {
        const colorString = entityState.render.material.color;
        let color = 0xffffff;
        
        if (typeof colorString === 'string') {
          const hex = colorString.replace('#', '');
          const parsed = parseInt(hex, 16);
          if (!isNaN(parsed)) {
            color = parsed;
          }
        } else if (typeof colorString === 'number') {
          color = colorString;
        }
        
        const currentColor = entity.mesh.material.color.getHex();
        if (currentColor !== color) {
          entity.mesh.material.color.setHex(color);
        }
      } catch (error) {
        console.warn(`Failed to set color:`, error);
        // Fallback to original color
        if (entity.originalColor !== undefined) {
          entity.mesh.material.color.setHex(entity.originalColor);
        }
      }
    }
  }

  private createEntity(state: any): GameEntity {
    console.log('🏗️ Creating entity with state:', {
      networkId: state.networkId,
      hasTransform: !!state.transform,
      hasRender: !!state.render,
      hasPhysics: !!state.physics,
      transform: state.transform,
      render: state.render
    });

    if (state.render?.material?.color) {
      console.log(`Creating entity ${state.networkId} with color:`, state.render.material.color);
    }
    
    if (!state.render) {
      console.log("⚠️ Entity has no render component, creating empty mesh");
      return {
        id: state.networkId,
        mesh: new THREE.Mesh(),
        originalColor: 0xffffff,
      };
    }

    const geometry = new THREE.BoxGeometry();
    
    // Convert color from hex string to hex number if needed
    let color = 0xffffff; // Default white
    if (state.render?.material?.color) {
      const colorString = state.render.material.color;
      console.log('🎨 Processing color:', colorString, typeof colorString);
      if (typeof colorString === 'string') {
        // Remove # if present and convert to hex number
        const hex = colorString.replace('#', '');
        const parsed = parseInt(hex, 16);
        if (!isNaN(parsed)) {
          color = parsed;
          console.log('✅ Color parsed successfully:', hex, '→', color);
        } else {
          console.warn(`Invalid color format in entity creation: ${colorString}`);
        }
      } else if (typeof colorString === 'number') {
        color = colorString;
        console.log('✅ Color is already a number:', color);
      }
    }
    
    const material = new THREE.MeshPhongMaterial({ color });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    console.log('🎨 Created mesh with color:', color.toString(16));

    // Set initial transform
    if (state.transform) {
      console.log('📍 Setting transform:', state.transform);
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

      console.log('📍 Applied transform - pos:', position, 'scale:', scale);
    } else {
      console.warn('⚠️ Entity has no transform component');
    }

    this.scene.add(mesh);
    console.log('✅ Added mesh to scene');

    const entity: GameEntity = {
      id: state.networkId,
      mesh,
      lastState: state,
      originalColor: color, // Store the original color
    };

    // Add to physics system if ready
    if (this.physicsSystem.isReady()) {
      const isStatic = state.physics?.isStatic || false;
      const useGravity = state.physics?.useGravity || true;
      const isClientAuthoritative =
        state.networkId === `player-${this.playerId}`;

      console.log('⚡ Adding to physics:', { isStatic, useGravity, isClientAuthoritative });

      this.physicsSystem.addEntity(
        entity,
        isStatic,
        useGravity,
        isClientAuthoritative
      );
    }

    // If this is the client player, update camera target
    if (state.networkId.startsWith("player-")) {
      console.log('📷 Setting camera target to player');
      this.controls.target.copy(mesh.position);
    }

    console.log('✅ Entity creation complete:', state.networkId);
    return entity;
  }

  private updateCamera(): void {
    if (this.ownedEntity) {
      // Calculate desired camera position based on player position
      const targetPosition = this.ownedEntity.mesh.position.clone();
      const idealOffset = this.cameraOffset.clone();

      // Set camera position directly (no interpolation)
      const desiredPosition = targetPosition.clone().add(idealOffset);
      this.camera.position.copy(desiredPosition);

      // Update orbit controls target directly
      this.controls.target.copy(targetPosition);
    }
  }

  private animate = (): void => {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(this.animate);

    const currentTime = Date.now();
    const deltaTime = this.lastUpdateTime > 0 ? (currentTime - this.lastUpdateTime) / 1000 : 1/60; // Default to 60fps if no previous time
    this.lastUpdateTime = currentTime;

    // Update physics with deltaTime for consistency with server
    if (this.physicsSystem.isReady()) {
      this.physicsSystem.update(deltaTime);
    }

    // Update camera to follow owned entity
    this.updateCamera();

    // Update controls
    this.controls.update();

    // Log scene info occasionally for debugging
    if (Math.floor(currentTime / 1000) % 5 === 0 && currentTime % 1000 < 50) { // Every 5 seconds
      console.log('🎬 Render info:', {
        sceneChildren: this.scene.children.length,
        entitiesManaged: this.entities.size,
        cameraPosition: this.camera.position,
        cameraTarget: this.controls.target
      });
      
      // List all entities in scene
      this.entities.forEach((entity, id) => {
        console.log(`📦 Entity ${id}:`, {
          position: entity.mesh.position,
          visible: entity.mesh.visible,
          inScene: this.scene.children.includes(entity.mesh)
        });
      });
    }

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
    
    // Clean up network monitor
    this.networkMonitor.cleanup();

    // Clear entities
    this.entities.clear();
  }

  public onDebugUpdate(callback: (info: any) => void): void {
    this.debugCallback = callback;
  }

  private setupNetworkMonitoring(): void {
    // Update network monitor periodically
    setInterval(() => {
      const stats = this.networkManager.getConnectionStats();
      this.networkMonitor.updateData(stats);
    }, 1000); // Update every second

    // Toggle monitor with F3 key
    window.addEventListener('keydown', (event) => {
      if (event.code === 'F3') {
        event.preventDefault();
        this.networkMonitor.toggle();
      }
    });
  }
}

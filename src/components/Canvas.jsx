import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Lock, 
  Unlock, 
  Trash2, 
  Type, 
  FileText,
  Video,
  Music,
  Image as ImageIcon,
  Check,
  X,
  AlertCircle,
  Map,
  Minimize2
} from 'lucide-react';
import { playUISound } from '../utils/audioSynth';

export function getFilterCss(filterName) {
  switch (filterName) {
    case 'grayscale': return 'grayscale(100%)';
    case 'sepia': return 'sepia(100%)';
    case 'vintage': return 'sepia(50%) contrast(120%) saturate(120%)';
    case 'cyberpunk': return 'hue-rotate(140deg) saturate(180%) contrast(110%)';
    case 'noir': return 'grayscale(100%) contrast(150%)';
    case 'blur': return 'blur(3px) contrast(90%)';
    default: return 'none';
  }
}

export default function Canvas({ 
  nodes, 
  setNodes, 
  connections, 
  setConnections, 
  draggedItem,
  setDraggedItem,
  selectedNodeId,
  setSelectedNodeId,
  isPresentationActive,
  isSidebarOpen,
  isPlaying,
  activeNodeId,
  isTimelineOpen
}) {
  const viewportRef = useRef(null);
  const canvasRef = useRef(null);
  
  // Canvas coordinate transform states
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [zoom, setZoom] = useState(1);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Dragging node states
  const [activeDragNodeId, setActiveDragNodeId] = useState(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Resizing node states
  const [activeResizeNodeId, setActiveResizeNodeId] = useState(null);
  const resizeStartRef = useRef({ startX: 0, startWidth: 220 });

  // Connection-drawing state
  const [drawingConnection, setDrawingConnection] = useState(null); // { fromNodeId, type: 'output', startX, startY }
  const [tempConnectionEnd, setTempConnectionEnd] = useState({ x: 0, y: 0 });

  // Video loading errors tracking (codecs support detection)
  const [videoErrors, setVideoErrors] = useState({});

  // Active double-clicked node showing trim sliders popover
  const [expandedTrimNodeId, setExpandedTrimNodeId] = useState(null);
  const [playingAudios, setPlayingAudios] = useState({});

  // Proactively check browser codec support for HEVC (H.265)
  const [supportsHEVC, setSupportsHEVC] = useState(true);
  const [showWarning, setShowWarning] = useState(true);
  const [selectedConnectionId, setSelectedConnectionId] = useState(null);
  const [isMiniMapOpen, setIsMiniMapOpen] = useState(true);
  const [isMiniMapDragging, setIsMiniMapDragging] = useState(false);
  const [renamingNodeId, setRenamingNodeId] = useState(null);

  const cablePhysicsRef = useRef({});
  const [physicsTick, setPhysicsTick] = useState(0);

  // requestAnimationFrame spring wire node physics tracking drag coordinates
  useEffect(() => {
    let animFrame;
    const updatePhysics = () => {
      let changed = false;
      nodes.forEach(node => {
        if (!cablePhysicsRef.current[node.id]) {
          cablePhysicsRef.current[node.id] = { x: node.x, y: node.y, vx: 0, vy: 0 };
        }
        const phys = cablePhysicsRef.current[node.id];
        
        const k = 0.18;
        const c = 0.65;
        const ax = k * (node.x - phys.x) - c * phys.vx;
        const ay = k * (node.y - phys.y) - c * phys.vy;
        
        phys.vx += ax;
        phys.vy += ay;
        phys.x += phys.vx;
        phys.y += phys.vy;
        
        const dist = Math.sqrt((phys.x - node.x)**2 + (phys.y - node.y)**2);
        const vel = Math.sqrt(phys.vx**2 + phys.vy**2);
        if (dist > 0.05 || vel > 0.05) {
          changed = true;
        }
      });
      
      if (changed) {
        setPhysicsTick(t => t + 1);
      }
      animFrame = requestAnimationFrame(updatePhysics);
    };
    animFrame = requestAnimationFrame(updatePhysics);
    return () => cancelAnimationFrame(animFrame);
  }, [nodes]);

  useEffect(() => {
    const video = document.createElement('video');
    const mp4Support = video.canPlayType('video/mp4; codecs="hvc1"') || video.canPlayType('video/mp4; codecs="hev1"');
    setSupportsHEVC(mp4Support === 'probably' || mp4Support === 'maybe');
  }, []);

  // Folder Import Modal state
  const [importFolderData, setImportFolderData] = useState(null); // { name, files: [...] }
  const [selectedImportIndices, setSelectedImportIndices] = useState([]);
  const [dropPosition, setDropPosition] = useState({ x: 100, y: 100 });

  // Handle keys for spacebar panning
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        setIsSpacePressed(true);
        // Prevent browser scrolling
        e.preventDefault();
      }
    };
    
    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  }, []);

  // Handle Delete/Backspace keys to remove selected node or connection
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          handleDeleteNode(selectedNodeId);
        } else if (selectedConnectionId) {
          setConnections(prev => prev.filter(c => c.id !== selectedConnectionId));
          setSelectedConnectionId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNodeId, selectedConnectionId, setConnections]);

  // Prevent global browser zoom (pinch-to-zoom and Ctrl+wheel) on sidebars/timeline
  useEffect(() => {
    const preventGlobalZoom = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    document.addEventListener('wheel', preventGlobalZoom, { passive: false });
    return () => {
      document.removeEventListener('wheel', preventGlobalZoom);
    };
  }, []);

  // Custom non-passive wheel listener for smooth canvas zoom
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheelRaw = (e) => {
      e.preventDefault();
      
      const zoomFactor = 1.08;
      const nextZoom = e.deltaY < 0 ? zoom * zoomFactor : zoom / zoomFactor;
      const clampedZoom = Math.min(Math.max(nextZoom, 0.15), 4);
      
      const rect = viewport.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const dx = mouseX - pan.x;
      const dy = mouseY - pan.y;
      
      setPan({
        x: mouseX - dx * (clampedZoom / zoom),
        y: mouseY - dy * (clampedZoom / zoom)
      });
      setZoom(clampedZoom);
    };

    viewport.addEventListener('wheel', handleWheelRaw, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', handleWheelRaw);
    };
  }, [zoom, pan]);

  // Convert screen coordinates to canvas space coordinates
  const screenToCanvas = (clientX, clientY) => {
    if (!viewportRef.current) return { x: 0, y: 0 };
    const rect = viewportRef.current.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y) / zoom;
    return { x, y };
  };

  // Pan & Drag Start
  const handleMouseDown = (e) => {
    // If user clicked inside a card or an input, don't initiate canvas actions
    if (e.target.closest('.floating-overlay-card') || e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) {
      return;
    }

    setSelectedNodeId(null); // Clear selection
    setSelectedConnectionId(null); // Clear connection selection

    if (isSpacePressed || e.button === 1 || e.button === 2 || e.target === viewportRef.current || e.target.closest('.infinite-grid')) {
      // Pan canvas
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      // Prevent context menus on right click
      if (e.button === 2) e.preventDefault();
    }
  };

  // Dragging nodes or panning canvas
  const handleMouseMove = (e) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y
      });
      return;
    }

    if (activeResizeNodeId !== null) {
      const deltaX = (e.clientX - resizeStartRef.current.startX) / zoom;
      const newWidth = Math.max(120, Math.min(800, resizeStartRef.current.startWidth + deltaX));
      setNodes(prevNodes => prevNodes.map(node => {
        if (node.id === activeResizeNodeId && !node.locked) {
          return {
            ...node,
            width: Math.round(newWidth)
          };
        }
        return node;
      }));
      return;
    }

    if (activeDragNodeId !== null) {
      const canvasCoords = screenToCanvas(e.clientX, e.clientY);
      setNodes(prevNodes => prevNodes.map(node => {
        if (node.id === activeDragNodeId && !node.locked) {
          return {
            ...node,
            x: Math.round(canvasCoords.x - dragOffsetRef.current.x),
            y: Math.round(canvasCoords.y - dragOffsetRef.current.y)
          };
        }
        return node;
      }));
      return;
    }

    if (drawingConnection) {
      const canvasCoords = screenToCanvas(e.clientX, e.clientY);
      setTempConnectionEnd(canvasCoords);
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setActiveDragNodeId(null);
    setDrawingConnection(null);
    setActiveResizeNodeId(null);
  };

  // Node dimensions based on type helper
  const getNodeDimensions = (node) => {
    if (!node) return { w: 200, h: 150 };
    switch (node.type) {
      case 'video': {
        const width = node.width || 220;
        const ratio = node.aspectRatio || 1.7777; // default 16:9
        // Card width is 'width'px. Video area width is width - 2px (borders).
        // Video height = videoAreaWidth / aspectRatio.
        // Card height = Video height + 35px header height.
        const videoHeight = (width - 2) / ratio;
        return { w: width, h: Math.round(videoHeight + 35) };
      }
      case 'audio': {
        return { w: node.width || 220, h: 72 };
      }
      case 'image': {
        const width = node.width || 220;
        const imageHeight = (width / 220) * 190;
        return { w: width, h: Math.round(imageHeight) };
      }
      case 'sticky': {
        const width = node.width || 180;
        return { w: width, h: width }; // Keep sticky notes square
      }
      default: {
        const width = node.width || 200;
        return { w: width, h: Math.round(width * 0.75) };
      }
    }
  };

  // Calculate pin coordinates on specific side of a node
  const getPinCoordsForSide = (node, side) => {
    const { w, h } = getNodeDimensions(node);
    switch (side) {
      case 'left':
        return { x: node.x, y: node.y + h / 2 };
      case 'right':
        return { x: node.x + w, y: node.y + h / 2 };
      case 'top':
        return { x: node.x + w / 2, y: node.y };
      case 'bottom':
        return { x: node.x + w / 2, y: node.y + h };
      default:
        return { x: node.x + w, y: node.y + h / 2 };
    }
  };

  // Find the two closest pin locations between two nodes
  const getShortestConnectionPins = (fromNode, toNode) => {
    const sides = ['left', 'right', 'top', 'bottom'];
    let shortestDist = Infinity;
    let bestStart = null;
    let bestEnd = null;
    let bestStartSide = 'right';
    let bestEndSide = 'left';

    sides.forEach(s1 => {
      const p1 = getPinCoordsForSide(fromNode, s1);
      sides.forEach(s2 => {
        const p2 = getPinCoordsForSide(toNode, s2);
        const dist = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
        if (dist < shortestDist) {
          shortestDist = dist;
          bestStart = p1;
          bestEnd = p2;
          bestStartSide = s1;
          bestEndSide = s2;
        }
      });
    });

    return { start: bestStart, end: bestEnd, startSide: bestStartSide, endSide: bestEndSide };
  };

  // Calculate Bezier control point offset relative to pin side orientation
  const getControlPointOffset = (side, distance) => {
    const strength = Math.max(30, distance * 0.4);
    switch (side) {
      case 'left':
        return { dx: -strength, dy: 0 };
      case 'right':
        return { dx: strength, dy: 0 };
      case 'top':
        return { dx: 0, dy: -strength };
      case 'bottom':
        return { dx: 0, dy: strength };
      default:
        return { dx: strength, dy: 0 };
    }
  };

  // Handle Drag Over
  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Scan folder handle recursively/flat
  const scanFolder = async (dirHandle) => {
    const foundFiles = [];
    try {
      const options = { mode: 'read' };
      if (await dirHandle.queryPermission(options) !== 'granted') {
        await dirHandle.requestPermission(options);
      }
      
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
          const ext = entry.name.split('.').pop().toLowerCase();
          let type = null;
          if (['mov', 'mp4', 'webm', 'mkv'].includes(ext)) type = 'video';
          else if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) type = 'audio';
          else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'].includes(ext)) type = 'image';
          
          if (type) {
            foundFiles.push({ handle: entry, name: entry.name, type });
          }
        }
      }
    } catch (err) {
      console.error('Error scanning folder handle:', err);
    }
    return foundFiles;
  };

  // Handle Drop
  const handleDrop = async (e) => {
    e.preventDefault();
    if (!draggedItem) return;

    const canvasDropCoords = screenToCanvas(e.clientX, e.clientY);

    if (draggedItem.kind === 'file') {
      // Individual file drop
      try {
        const fileHandle = draggedItem.handle;
        const fileObj = await fileHandle.getFile();
        const ext = fileObj.name.split('.').pop().toLowerCase();
        
        let blobUrl = '';
        let nodeType = draggedItem.type;
        
        if (ext === 'heic' || ext === 'heif') {
          nodeType = 'image';
          const heic2any = (await import('heic2any')).default;
          const convertedBlob = await heic2any({
            blob: fileObj,
            toType: 'image/jpeg',
            quality: 0.8
          });
          blobUrl = URL.createObjectURL(convertedBlob);
        } else {
          blobUrl = URL.createObjectURL(fileObj);
        }

        // Get duration if video/audio
        let duration = 0;
        if (nodeType === 'video' || nodeType === 'audio') {
          duration = await getMediaDuration(blobUrl, nodeType);
        }

        const newNode = {
          id: `node-${Date.now()}`,
          type: draggedItem.type,
          name: draggedItem.name,
          url: blobUrl,
          x: Math.round(canvasDropCoords.x - 110),
          y: Math.round(canvasDropCoords.y - 90),
          width: draggedItem.type === 'sticky' ? 180 : 220,
          startTime: 0,
          endTime: duration > 0 ? duration : 10,
          duration: duration > 0 ? duration : 10,
          volume: 0.8,
          locked: false,
          color: getRandomColor(draggedItem.type)
        };

        setNodes(prev => [...prev, newNode]);
      } catch (err) {
        console.error('Failed to resolve drop file handle', err);
      }
    } else if (draggedItem.kind === 'directory') {
      // Folder drop
      setDropPosition(canvasDropCoords);
      const discovered = await scanFolder(draggedItem.handle);
      setImportFolderData({
        name: draggedItem.name,
        files: discovered
      });
      setSelectedImportIndices(discovered.map((_, i) => i)); // default select all
    }

    setDraggedItem(null);
  };

  // Async helper to load media metadata and extract its actual duration
  const getMediaDuration = (blobUrl, type) => {
    return new Promise((resolve) => {
      const el = document.createElement(type);
      el.src = blobUrl;
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        resolve(el.duration);
      };
      el.onerror = () => {
        resolve(10); // fallback
      };
    });
  };

  const getRandomColor = (type) => {
    if (type === 'sticky') return 'var(--accent-orange)';
    if (type === 'video') return 'var(--accent-cyan)';
    if (type === 'audio') return 'var(--accent-pink)';
    return 'var(--accent-purple)';
  };

  // Confirm folder importing
  const handleConfirmImport = async () => {
    if (!importFolderData) return;
    
    const selectedFiles = importFolderData.files.filter((_, idx) => selectedImportIndices.includes(idx));
    const newNodes = [];

    // Arrange nodes in a circular layout or grid offset around drop location
    const spacing = 240;
    const itemsPerRow = Math.ceil(Math.sqrt(selectedFiles.length));

    for (let idx = 0; idx < selectedFiles.length; idx++) {
      const fileData = selectedFiles[idx];
      try {
        const fileObj = await fileData.handle.getFile();
        const ext = fileObj.name.split('.').pop().toLowerCase();
        
        let blobUrl = '';
        let nodeType = fileData.type;
        
        if (ext === 'heic' || ext === 'heif') {
          nodeType = 'image';
          const heic2any = (await import('heic2any')).default;
          const convertedBlob = await heic2any({
            blob: fileObj,
            toType: 'image/jpeg',
            quality: 0.8
          });
          blobUrl = URL.createObjectURL(convertedBlob);
        } else {
          blobUrl = URL.createObjectURL(fileObj);
        }
        
        let duration = 0;
        if (nodeType === 'video' || nodeType === 'audio') {
          duration = await getMediaDuration(blobUrl, nodeType);
        }

        const col = idx % itemsPerRow;
        const row = Math.floor(idx / itemsPerRow);

        newNodes.push({
          id: `node-${Date.now()}-${idx}`,
          type: nodeType,
          name: fileData.name,
          url: blobUrl,
          x: Math.round(dropPosition.x - 110 + (col * spacing)),
          y: Math.round(dropPosition.y - 90 + (row * spacing)),
          width: nodeType === 'sticky' ? 180 : 220,
          startTime: 0,
          endTime: duration > 0 ? duration : 10,
          duration: duration > 0 ? duration : 10,
          volume: 0.8,
          locked: false,
          color: getRandomColor(nodeType)
        });
      } catch (err) {
        console.error('Failed to import file from folder', err);
      }
    }

    setNodes(prev => [...prev, ...newNodes]);
    setImportFolderData(null);
  };

  // Double click canvas to create a sticky note
  const handleDoubleClickCanvas = (e) => {
    if (e.target !== viewportRef.current && !e.target.classList.contains('infinite-grid')) return;
    
    const coords = screenToCanvas(e.clientX, e.clientY);
    const colorOptions = ['var(--accent-orange)', 'var(--accent-cyan)', 'var(--accent-pink)', 'var(--accent-purple)'];
    const randomColor = colorOptions[Math.floor(Math.random() * colorOptions.length)];

    const newSticky = {
      id: `sticky-${Date.now()}`,
      type: 'sticky',
      name: 'Sticky Note',
      text: 'Click here to edit note contents...',
      x: Math.round(coords.x - 90),
      y: Math.round(coords.y - 90),
      width: 180,
      color: randomColor,
      locked: false
    };

    setNodes(prev => [...prev, newSticky]);
  };

  // Start drawing connection curve
  const handlePinMouseDown = (e, node, side) => {
    e.preventDefault();
    e.stopPropagation();
    playUISound('click');
    const pinCoords = getPinCoordsForSide(node, side);
    setDrawingConnection({
      fromNodeId: node.id,
      fromSide: side,
      startX: pinCoords.x,
      startY: pinCoords.y
    });
    setTempConnectionEnd({ x: pinCoords.x, y: pinCoords.y });
  };

  // Finish drawing connection curve on another node's pin
  const handlePinMouseUp = (e, targetNode, targetSide) => {
    e.stopPropagation();
    if (!drawingConnection) return;
    
    // Prevent self loop
    if (drawingConnection.fromNodeId !== targetNode.id) {
      const fromNodeId = drawingConnection.fromNodeId;
      const toNodeId = targetNode.id;
      
      // Check if connection already exists
      const exists = connections.some(c => c.from === fromNodeId && c.to === toNodeId);
      if (!exists) {
        playUISound('connect');
        setConnections(prev => [...prev, {
          id: `conn-${Date.now()}`,
          from: fromNodeId,
          to: toNodeId,
          transition: 'cut'
        }]);
      }
    }
    setDrawingConnection(null);
  };

  const handleDeleteNode = (nodeId) => {
    playUISound('delete');
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => {
      const remaining = prev.filter(c => c.from !== nodeId && c.to !== nodeId);
      if (selectedConnectionId && !remaining.some(c => c.id === selectedConnectionId)) {
        setSelectedConnectionId(null);
      }
      return remaining;
    });
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  // Calculate midpoint of a Bezier curve
  const getBezierMidpoint = (start, end) => {
    const dx = Math.abs(end.x - start.x) * 0.5;
    const p0 = start;
    const p1 = { x: start.x + dx, y: start.y };
    const p2 = { x: end.x - dx, y: end.y };
    const p3 = end;
    
    return {
      x: 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x,
      y: 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y
    };
  };

  // Cycle connection transition type
  const cycleConnectionTransition = (connId) => {
    const transitionTypes = ['none', 'cut', 'fade', 'slide', 'zoom', 'dissolve'];
    setConnections(prev => prev.map(c => {
      if (c.id === connId) {
        const current = c.transition || 'cut';
        const idx = transitionTypes.indexOf(current);
        const nextIdx = (idx + 1) % transitionTypes.length;
        playUISound('change');
        return { ...c, transition: transitionTypes[nextIdx] };
      }
      return c;
    }));
  };

  const handleResizeMouseDown = (e, node) => {
    e.stopPropagation();
    e.preventDefault();
    if (node.locked) return;
    setActiveResizeNodeId(node.id);
    resizeStartRef.current = {
      startX: e.clientX,
      startWidth: node.width || (node.type === 'sticky' ? 180 : 220)
    };
  };

  const toggleLockNode = (nodeId) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, locked: !n.locked } : n));
  };

  const handleNodeTextChange = (nodeId, val) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, text: val } : n));
  };

  const handleRenameNode = (nodeId, val) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, name: val } : n));
  };

  const updateNodeFilter = (nodeId, filterName) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, filter: filterName } : n));
  };

  const updateNodeSpeed = (nodeId, speedVal) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, speed: Number(speedVal) } : n));
  };

  const updateConnectionDuration = (connId, durationVal) => {
    setConnections(prev => prev.map(c => {
      if (c.id === connId) {
        return { ...c, duration: Math.max(0.2, Math.min(4.0, Number(durationVal))) };
      }
      return c;
    }));
  };

  const handleTrimChange = (nodeId, side, val) => {
    setNodes(prev => prev.map(n => {
      if (n.id === nodeId) {
        let startTime = n.startTime;
        let endTime = n.endTime;
        if (side === 'start') {
          startTime = Math.min(Number(val), endTime - 0.5);
        } else {
          endTime = Math.max(Number(val), startTime + 0.5);
        }
        return { ...n, startTime, endTime };
      }
      return n;
    }));
  };

  const toggleMuteVideo = (nodeId) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, volume: n.volume > 0 ? 0 : 0.8 } : n));
  };

  const updateNodeAspectRatio = (nodeId, ratio) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, aspectRatio: ratio } : n));
  };

  // Video hover play actions
  const handleVideoMouseEnter = (e) => {
    const video = e.currentTarget.querySelector('video');
    if (video) {
      const node = nodes.find(n => n.url === video.src || video.src.includes(n.url));
      if (node) {
        video.playbackRate = node.speed || 1.0;
      }
      video.play().catch(err => {});
    }
  };

  const handleVideoMouseLeave = (e) => {
    const video = e.currentTarget.querySelector('video');
    if (video) {
      video.pause();
      // Reset video to start time on mouse leave
      const node = nodes.find(n => n.url === video.src || video.src.includes(n.url));
      if (node) {
        video.currentTime = node.startTime;
      }
    }
  };

  const handleVideoClick = (e) => {
    e.stopPropagation();
    const video = e.currentTarget.querySelector('video');
    if (video) {
      const node = nodes.find(n => n.url === video.src || video.src.includes(n.url));
      if (node) {
        video.playbackRate = node.speed || 1.0;
      }
      if (video.paused) {
        video.play().catch(err => {});
      } else {
        video.pause();
      }
    }
  };

  // Synchronize playing and boundary looping of video nodes in canvas
  const handleVideoTimeUpdate = (e, node) => {
    const video = e.currentTarget;
    if (video.currentTime > node.endTime) {
      video.currentTime = node.startTime;
    }
    if (video.currentTime < node.startTime) {
      video.currentTime = node.startTime;
    }
  };

  // Calculate viewport boundaries and node representations for the mini-map
  const miniMapData = React.useMemo(() => {
    const viewportWidth = viewportRef.current ? viewportRef.current.clientWidth : window.innerWidth || 1200;
    const viewportHeight = viewportRef.current ? viewportRef.current.clientHeight : window.innerHeight || 800;
    
    // Viewport box in canvas space
    const viewportLeft = -pan.x / zoom;
    const viewportTop = -pan.y / zoom;
    const viewportRight = (viewportWidth - pan.x) / zoom;
    const viewportBottom = (viewportHeight - pan.y) / zoom;
    
    // Nodes bounding box
    let minX = viewportLeft;
    let minY = viewportTop;
    let maxX = viewportRight;
    let maxY = viewportBottom;
    
    if (nodes.length > 0) {
      nodes.forEach(node => {
        const { w, h } = getNodeDimensions(node);
        if (node.x < minX) minX = node.x;
        if (node.y < minY) minY = node.y;
        if (node.x + w > maxX) maxX = node.x + w;
        if (node.y + h > maxY) maxY = node.y + h;
      });
    }
    
    // Add margin around the active bounds
    const margin = 150;
    minX -= margin;
    minY -= margin;
    maxX += margin;
    maxY += margin;
    
    const rangeX = maxX - minX;
    const rangeY = maxY - minY;
    
    const mapWidth = 140;
    const mapHeight = 90;
    
    const scaleX = mapWidth / rangeX;
    const scaleY = mapHeight / rangeY;
    const scale = Math.min(scaleX, scaleY);
    
    const offsetX = (mapWidth - rangeX * scale) / 2;
    const offsetY = (mapHeight - rangeY * scale) / 2;
    
    return {
      minX,
      minY,
      scale,
      offsetX,
      offsetY,
      viewportBox: {
        x: (viewportLeft - minX) * scale + offsetX,
        y: (viewportTop - minY) * scale + offsetY,
        w: (viewportRight - viewportLeft) * scale,
        h: (viewportBottom - viewportTop) * scale
      },
      mapNodes: nodes.map(node => {
        const { w, h } = getNodeDimensions(node);
        return {
          id: node.id,
          color: node.color,
          x: (node.x - minX) * scale + offsetX,
          y: (node.y - minY) * scale + offsetY,
          w: w * scale,
          h: h * scale
        };
      })
    };
  }, [nodes, pan, zoom]);

  const updatePanFromMiniMap = (clientX, clientY, rect) => {
    if (!viewportRef.current || !rect) return;
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    
    const { minX, minY, scale, offsetX, offsetY } = miniMapData;
    
    const cx = (clickX - offsetX) / scale + minX;
    const cy = (clickY - offsetY) / scale + offsetY;
    
    const viewportWidth = viewportRef.current.clientWidth;
    const viewportHeight = viewportRef.current.clientHeight;
    
    setPan({
      x: viewportWidth / 2 - cx * zoom,
      y: viewportHeight / 2 - cy * zoom
    });
  };

  const handleMiniMapMouseDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    setIsMiniMapDragging(true);
    const rect = e.currentTarget.getBoundingClientRect();
    updatePanFromMiniMap(e.clientX, e.clientY, rect);
    playUISound('click');
  };

  useEffect(() => {
    if (!isMiniMapDragging) return;
    
    const handleWindowMouseMove = (e) => {
      const minimapEl = document.querySelector('.minimap-svg-container');
      if (minimapEl) {
        const rect = minimapEl.getBoundingClientRect();
        updatePanFromMiniMap(e.clientX, e.clientY, rect);
      }
    };
    
    const handleWindowMouseUp = () => {
      setIsMiniMapDragging(false);
    };
    
    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [isMiniMapDragging, miniMapData, zoom]);

  return (
    <div 
      ref={viewportRef}
      className="canvas-viewport"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDoubleClick={handleDoubleClickCanvas}
      style={{
        flex: 1,
        background: 'var(--bg-primary)',
        display: isPresentationActive ? 'none' : 'block'
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Global HEVC Support Notice Banner */}
      {!supportsHEVC && showWarning && (
        <div 
          className="glass-panel" 
          style={{
            position: 'absolute',
            top: '20px',
            left: isSidebarOpen ? '300px' : '80px',
            right: '280px',
            background: 'rgba(249, 115, 22, 0.1)',
            border: '1px solid rgba(249, 115, 22, 0.3)',
            borderRadius: '8px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '11px',
            color: 'var(--accent-orange)',
            zIndex: 100,
            backdropFilter: 'blur(12px)',
            pointerEvents: 'auto',
            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
            <AlertCircle size={14} style={{ flexShrink: 0 }} />
            <span style={{ lineHeight: '1.4' }}>
              <strong>Browser HEVC (H.265) Limitation Notice:</strong> Your browser does not support native HEVC video streams on Windows. iPhone `.MOV` files will render black. To resolve this, you can convert them to standard <strong>H.264 .mp4</strong>, or install the <strong>HEVC Video Extensions</strong> from the Microsoft Store.
            </span>
          </div>
          <button
            onClick={() => setShowWarning(false)}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent-orange)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '4px',
              opacity: 0.7,
              transition: 'opacity 0.2s, background-color 0.2s',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.backgroundColor = 'rgba(249, 115, 22, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0.7';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
            title="Dismiss warning"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Grid background */}
      <div 
        className="infinite-grid" 
        style={{
          backgroundPosition: `${pan.x}px ${pan.y}px`,
          backgroundSize: `${24 * zoom}px ${24 * zoom}px`,
          backgroundImage: `radial-gradient(rgba(232, 157, 108, ${0.03 + (zoom * 0.02)}) 1px, transparent 1px)`
        }}
      />

      {/* Canvas coordinates context */}
      <div 
        className="canvas-content"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          pointerEvents: 'none'
        }}
      >
        
        {/* Draw connections layer */}
        <svg className="connections-layer">
          <defs>
            <linearGradient id="neonGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--accent-cyan)" />
              <stop offset="100%" stopColor="var(--accent-purple)" />
            </linearGradient>
            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <marker 
              id="arrow" 
              viewBox="0 0 10 10" 
              refX="8" 
              refY="5" 
              markerWidth="6" 
              markerHeight="6" 
              orient="auto"
            >
              <path d="M 2 2 L 8 5 L 2 8 z" fill="var(--accent-purple)" />
            </marker>
          </defs>

          {/* Render actual connections */}
          {connections.map((c) => {
            const fromNode = nodes.find(n => n.id === c.from);
            const toNode = nodes.find(n => n.id === c.to);
            if (!fromNode || !toNode) return null;

            const { start, end, startSide, endSide } = getShortestConnectionPins(fromNode, toNode);

            // Spring physics elastic wire calculations
            const physFrom = cablePhysicsRef.current[fromNode.id] || { x: fromNode.x, y: fromNode.y };
            const lagFromX = physFrom.x - fromNode.x;
            const lagFromY = physFrom.y - fromNode.y;

            const physTo = cablePhysicsRef.current[toNode.id] || { x: toNode.x, y: toNode.y };
            const lagToX = physTo.x - toNode.x;
            const lagToY = physTo.y - toNode.y;

            const dist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
            const offsetStart = getControlPointOffset(startSide, dist);
            const offsetEnd = getControlPointOffset(endSide, dist);

            const ctrl1X = start.x + offsetStart.dx + lagFromX;
            const ctrl1Y = start.y + offsetStart.dy + lagFromY;
            const ctrl2X = end.x + offsetEnd.dx + lagToX;
            const ctrl2Y = end.y + offsetEnd.dy + lagToY;

            const path = `M ${start.x} ${start.y} C ${ctrl1X} ${ctrl1Y}, ${ctrl2X} ${ctrl2Y}, ${end.x} ${end.y}`;

            const isSelectedConn = selectedConnectionId === c.id;
            const isCableActive = activeNodeId === c.from && isPlaying;

            let strokeColor = fromNode.color || "var(--accent-purple)";
            let className = "connector-cable";

            if (isSelectedConn) {
              strokeColor = "#ffffff";
              className = "connector-cable-selected";
            } else if (isCableActive) {
              strokeColor = fromNode.color || "var(--accent-cyan)";
              className = "connector-cable-playing";
            }

            // Midpoint of Bezier using spring lagged control points
            const mid = {
              x: 0.125 * start.x + 0.375 * ctrl1X + 0.375 * ctrl2X + 0.125 * end.x,
              y: 0.125 * start.y + 0.375 * ctrl1Y + 0.375 * ctrl2Y + 0.125 * end.y
            };

            return (
              <g key={c.id}>
                {/* Render secondary glowing highlight if selected */}
                {isSelectedConn && (
                  <path 
                    d={path}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="6"
                    style={{ opacity: 0.8, filter: 'drop-shadow(0 0 4px var(--accent-cyan))' }}
                  />
                )}
                <path 
                  d={path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={isSelectedConn ? "4" : (isCableActive ? "3.5" : "2.5")}
                  className={className}
                  style={{ 
                    stroke: strokeColor,
                    opacity: isSelectedConn ? 1 : (isCableActive ? 0.95 : 0.4),
                    filter: (isSelectedConn || isCableActive) ? 'url(#neonGlow)' : 'none',
                    pointerEvents: 'auto', 
                    cursor: 'pointer' 
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedConnectionId(c.id);
                    setSelectedNodeId(null);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    cycleConnectionTransition(c.id);
                  }}
                  title="Double-click to toggle transition"
                  markerEnd="url(#arrow)"
                />

                {/* Render moving optic pulse particle along active cable */}
                {isCableActive && (
                  <g>
                    {/* Outer Glow Halo */}
                    <circle r="7" fill={strokeColor} opacity="0.65" style={{ filter: 'blur(2px)' }}>
                      <animateMotion dur="1.8s" repeatCount="indefinite" path={path} />
                    </circle>
                    {/* Core White Pulse */}
                    <circle r="3" fill="#ffffff">
                      <animateMotion dur="1.8s" repeatCount="indefinite" path={path} />
                    </circle>
                  </g>
                )}
                
                {/* Render HTML transition pill on canvas */}
                <foreignObject
                  x={mid.x - 45}
                  y={mid.y - 12}
                  width="90"
                  height="24"
                  style={{ pointerEvents: 'auto' }}
                >
                  <div
                    className={`transition-badge ${c.transition || 'cut'}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      height: '100%',
                      background: 'rgba(9, 10, 15, 0.35)',
                      border: isSelectedConn ? '1.5px solid #ffffff' : '1px solid var(--border-glass)',
                      borderRadius: '12px',
                      fontSize: '9px',
                      fontWeight: 'bold',
                      color: 'var(--text-primary)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                      transition: 'all 0.2s ease',
                      padding: '0 6px',
                      cursor: 'default'
                    }}
                  >
                    <span
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        cycleConnectionTransition(c.id);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedConnectionId(c.id);
                        setSelectedNodeId(null);
                      }}
                      style={{ cursor: 'pointer', textTransform: 'uppercase', flex: 1, textAlign: 'center' }}
                      title="Double-click to cycle transition"
                    >
                      {c.transition || 'cut'}
                    </span>
                    {c.transition && c.transition !== 'cut' && c.transition !== 'none' && (
                      <input
                        type="number"
                        min="0.2"
                        max="4.0"
                        step="0.1"
                        value={c.duration || 1.0}
                        onChange={(e) => {
                          e.stopPropagation();
                          updateConnectionDuration(c.id, e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        style={{
                          width: '28px',
                          background: 'rgba(0,0,0,0.4)',
                          border: 'none',
                          borderRadius: '4px',
                          color: '#fff',
                          fontSize: '8px',
                          textAlign: 'center',
                          outline: 'none',
                          padding: '2px 0',
                          marginLeft: '4px'
                        }}
                        title="Transition duration (seconds)"
                      />
                    )}
                  </div>
                </foreignObject>
              </g>
            );
          })}

          {/* Render active dragging path */}
          {drawingConnection && (() => {
            const start = { x: drawingConnection.startX, y: drawingConnection.startY };
            const end = tempConnectionEnd;
            const dist = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
            const offsetStart = getControlPointOffset(drawingConnection.fromSide, dist);
            const ctrl1X = start.x + offsetStart.dx;
            const ctrl1Y = start.y + offsetStart.dy;
            const ctrl2X = end.x - offsetStart.dx * 0.5;
            const ctrl2Y = end.y - offsetStart.dy * 0.5;
            const path = `M ${start.x} ${start.y} C ${ctrl1X} ${ctrl1Y}, ${ctrl2X} ${ctrl2Y}, ${end.x} ${end.y}`;
            return (
              <path 
                d={path}
                fill="none"
                stroke="var(--text-secondary)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                markerEnd="url(#arrow)"
              />
            );
          })()}
        </svg>

        {/* Nodes Layer */}
        {nodes.map((node) => {
          const dims = getNodeDimensions(node);
          const isSelected = selectedNodeId === node.id;
          const isPossiblyHEVC = node.type === 'video' && (node.name.toLowerCase().endsWith('.mov') || node.name.toLowerCase().endsWith('.mkv'));
          const showCodecWarning = isPossiblyHEVC && !supportsHEVC;

          return (
            <div
              key={node.id}
              className={`floating-overlay-card fade-in ${isSelected ? 'selected' : ''} ${node.type === 'audio' && activeNodeId === node.id && isPlaying ? 'audio-active-glow' : ''}`}
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${dims.w}px`,
                height: `${dims.h}px`,
                pointerEvents: 'auto',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'visible', // Enable overflow to show trim popups below
                border: isSelected ? '1px solid var(--border-glass-glow)' : '1px solid var(--border-glass)',
                borderRadius: '12px',
                background: node.type === 'sticky' ? '#E2DCD2' : 'var(--bg-panel)',
                color: node.type === 'sticky' ? '#121211' : 'var(--text-primary)',
                boxShadow: isSelected 
                  ? `0 0 25px -5px ${node.color || 'var(--border-glass-glow)'}, 0 12px 40px rgba(0, 0, 0, 0.75), var(--shadow-premium)` 
                  : `0 0 12px -3px ${node.color || 'transparent'}, 0 4px 16px rgba(0, 0, 0, 0.5), var(--shadow-premium)`
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                setSelectedNodeId(node.id);
                setSelectedConnectionId(null); // Clear connection selection
                if (!node.locked && e.button === 0 && !e.target.closest('button') && !e.target.closest('input') && !e.target.closest('textarea')) {
                  setActiveDragNodeId(node.id);
                  const coords = screenToCanvas(e.clientX, e.clientY);
                  dragOffsetRef.current = {
                    x: coords.x - node.x,
                    y: coords.y - node.y
                  };
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation(); // Block canvas double-click note generation
                if (node.type === 'video' || node.type === 'audio' || node.type === 'image') {
                  setExpandedTrimNodeId(expandedTrimNodeId === node.id ? null : node.id);
                }
              }}
            >
              {/* Left Pin */}
              <div 
                className="connector-pin pin-left"
                onMouseDown={(e) => handlePinMouseDown(e, node, 'left')}
                onMouseUp={(e) => handlePinMouseUp(e, node, 'left')}
                title="Connect Left"
              />

              {/* Right Pin */}
              <div 
                className="connector-pin pin-right"
                onMouseDown={(e) => handlePinMouseDown(e, node, 'right')}
                onMouseUp={(e) => handlePinMouseUp(e, node, 'right')}
                title="Connect Right"
              />

              {/* Top Pin */}
              <div 
                className="connector-pin pin-top"
                onMouseDown={(e) => handlePinMouseDown(e, node, 'top')}
                onMouseUp={(e) => handlePinMouseUp(e, node, 'top')}
                title="Connect Top"
              />

              {/* Bottom Pin */}
              <div 
                className="connector-pin pin-bottom"
                onMouseDown={(e) => handlePinMouseDown(e, node, 'bottom')}
                onMouseUp={(e) => handlePinMouseUp(e, node, 'bottom')}
                title="Connect Bottom"
              />

              {/* Resize Handle */}
              {!node.locked && (
                <div 
                  className="resize-handle"
                  onMouseDown={(e) => handleResizeMouseDown(e, node)}
                  onDoubleClick={(e) => e.stopPropagation()}
                  title="Drag to resize card (aspect ratio locked for video/image)"
                />
              )}

              {/* Figma-Style Selection Corner Grips */}
              {isSelected && (
                <>
                  <div className="corner-grip top-left" />
                  <div className="corner-grip top-right" />
                  <div className="corner-grip bottom-left" />
                  <div className="corner-grip bottom-right" />
                </>
              )}

              {/* Node Header */}
              <div 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: node.type === 'sticky' ? 'rgba(0, 0, 0, 0.03)' : 'rgba(0, 0, 0, 0.2)',
                  borderBottom: node.type === 'sticky' ? '1px solid rgba(18, 18, 17, 0.08)' : '1px solid var(--border-glass)',
                  cursor: node.locked ? 'default' : 'grab',
                  borderTopLeftRadius: '11px',
                  borderTopRightRadius: '11px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}>
                  {node.type === 'video' && <Video size={13} style={{ color: 'var(--accent-cyan)' }} />}
                  {node.type === 'audio' && <Music size={13} style={{ color: 'var(--accent-pink)' }} />}
                  {node.type === 'image' && <ImageIcon size={13} style={{ color: 'var(--accent-purple)' }} />}
                  {node.type === 'sticky' && <FileText size={13} style={{ color: 'var(--accent-orange)' }} />}
                  
                  {renamingNodeId === node.id ? (
                    <input 
                      type="text"
                      value={node.name}
                      onChange={(e) => handleRenameNode(node.id, e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setRenamingNodeId(null);
                        }
                      }}
                      onBlur={() => setRenamingNodeId(null)}
                      autoFocus
                      style={{
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid var(--border-glass-glow)',
                        borderRadius: '4px',
                        color: node.type === 'sticky' ? '#121211' : 'var(--text-primary)',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        fontSize: '11px',
                        outline: 'none',
                        width: '100%',
                        padding: '2px 4px',
                        margin: 0
                      }}
                    />
                  ) : (
                    <span 
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        if (!node.locked) {
                          setRenamingNodeId(node.id);
                        }
                      }}
                      style={{
                        color: node.type === 'sticky' ? '#121211' : 'var(--text-primary)',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        fontSize: '11px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flex: 1,
                        cursor: node.locked ? 'default' : 'text'
                      }}
                      title={node.locked ? node.name : "Double-click to rename"}
                    >
                      {node.name}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button 
                    onClick={() => toggleLockNode(node.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: node.locked ? 'var(--accent-orange)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      padding: '2px'
                    }}
                  >
                    {node.locked ? <Lock size={12} /> : <Unlock size={12} />}
                  </button>
                  <button 
                    onClick={() => handleDeleteNode(node.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      padding: '2px'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Node Body Content */}
              <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px' }}>
                
                {/* VIDEO NODE */}
                {node.type === 'video' && (() => {
                  const hasError = videoErrors[node.id] || showCodecWarning;
                  const errorText = videoErrors[node.id] || "H.265 (HEVC) unsupported by browser. Convert to standard H.264 .mp4 or install Windows HEVC Extensions.";

                  return (
                    <div 
                      style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#000', cursor: 'pointer' }}
                      onMouseEnter={handleVideoMouseEnter}
                      onMouseLeave={handleVideoMouseLeave}
                      onClick={handleVideoClick}
                    >
                      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {hasError ? (
                          <div 
                            style={{
                              position: 'absolute',
                              top: 0, left: 0, right: 0, bottom: 0,
                              background: 'rgba(12, 15, 20, 0.95)',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '12px',
                              textAlign: 'center',
                              color: 'var(--text-secondary)'
                            }}
                          >
                            <AlertCircle size={20} style={{ color: 'var(--accent-orange)', marginBottom: '6px' }} />
                            <span style={{ fontSize: '10px', lineHeight: '1.4' }}>
                              {errorText}
                            </span>
                          </div>
                        ) : (
                          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                            <video 
                              src={node.url} 
                              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: getFilterCss(node.filter) }}
                              muted={true}
                              playsInline
                              loop
                              onTimeUpdate={(e) => handleVideoTimeUpdate(e, node)}
                              onLoadedMetadata={(e) => {
                                e.currentTarget.currentTime = node.startTime;
                                const { videoWidth, videoHeight } = e.currentTarget;
                                if (videoWidth && videoHeight) {
                                  const aspectRatio = videoWidth / videoHeight;
                                  if (node.aspectRatio !== aspectRatio) {
                                    updateNodeAspectRatio(node.id, aspectRatio);
                                  }
                                }
                              }}
                              onError={(e) => {
                                console.error("Video load error for node:", node.name, e);
                                setVideoErrors(prev => ({
                                  ...prev,
                                  [node.id]: "Unsupported format or codec. Try converting to H.264 .mp4."
                                }));
                              }}
                            />
                            {/* Transparent overlay to block browser-injected PIP/translation overlays */}
                            <div 
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: '100%',
                                background: 'transparent',
                                zIndex: 2
                              }}
                            />
                          </div>
                        )}
                      <div 
                        style={{
                          position: 'absolute',
                          bottom: '6px',
                          right: '6px',
                          background: 'rgba(0,0,0,0.6)',
                          borderRadius: '4px',
                          padding: '2px 4px',
                          fontSize: '9px',
                          fontFamily: 'monospace'
                        }}
                      >
                        {(node.endTime - node.startTime).toFixed(1)}s
                      </div>
                    </div>
                  </div>
                );
              })()}

                {/* AUDIO NODE */}
                {node.type === 'audio' && (
                  <div style={{ flex: 1, padding: '10px', background: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button 
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: 'var(--accent-pink)',
                          border: 'none',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const audio = e.currentTarget.nextSibling;
                          if (audio.paused) {
                            audio.play().catch(err => {});
                          } else {
                            audio.pause();
                          }
                        }}
                      >
                        <Play size={12} fill="#fff" />
                      </button>
                      <audio 
                        src={node.url} 
                        loop 
                        onPlay={() => setPlayingAudios(prev => ({ ...prev, [node.id]: true }))}
                        onPause={() => setPlayingAudios(prev => ({ ...prev, [node.id]: false }))}
                        onTimeUpdate={(e) => {
                          if (e.currentTarget.currentTime > node.endTime) {
                            e.currentTarget.currentTime = node.startTime;
                          }
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '11px', fontWeight: '500', color: 'var(--text-primary)' }}>Audio Track</span>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Duration: {node.duration.toFixed(1)}s</span>
                      </div>

                      {/* CSS Waveform */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '24px', marginLeft: 'auto', paddingRight: '8px' }}>
                        {[0.3, 0.7, 0.5, 0.9, 0.4, 0.8, 0.6, 0.95, 0.5, 0.7, 0.3].map((height, i) => {
                          const isAudioPlaying = playingAudios[node.id] || (activeNodeId === node.id && isPlaying);
                          return (
                            <div 
                              key={i}
                              style={{
                                width: '2px',
                                height: `${height * 100}%`,
                                background: 'var(--accent-pink)',
                                borderRadius: '1px',
                                transformOrigin: 'bottom',
                                animation: isAudioPlaying ? `bounceWave 0.8s ease-in-out infinite alternate` : 'none',
                                animationDelay: `${i * 0.08}s`
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* IMAGE NODE */}
                {node.type === 'image' && (
                  <div style={{ flex: 1, background: '#090a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <img 
                      src={node.url} 
                      alt={node.name} 
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        filter: getFilterCss(node.filter)
                      }}
                      draggable={false}
                    />
                  </div>
                )}

                {/* STICKY NOTE / TEXT BLOCK */}
                {node.type === 'sticky' && (
                  <textarea
                    value={node.text}
                    onChange={(e) => handleNodeTextChange(node.id, e.target.value)}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      resize: 'none',
                      color: '#121211',
                      padding: '12px',
                      fontSize: '13px',
                      fontFamily: 'var(--font-body)',
                      outline: 'none',
                      lineHeight: '1.5',
                      pointerEvents: 'auto'
                    }}
                    placeholder="Type notes..."
                  />
                )}

              </div>

              {/* Floating Trim & Filter Popover */}
              {expandedTrimNodeId === node.id && (node.type === 'video' || node.type === 'audio' || node.type === 'image') && (
                <div 
                  className="glass-panel"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    right: 0,
                    background: 'var(--bg-panel)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid var(--border-glass)',
                    borderRadius: '8px',
                    padding: '10px',
                    zIndex: 1000,
                    boxShadow: 'var(--shadow-premium)',
                    pointerEvents: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  {(node.type === 'video' || node.type === 'audio') && (
                    <>
                      <div style={{ display: 'flex', justifyItems: 'center', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-secondary)' }}>
                        <span>Trim: {node.startTime.toFixed(1)}s - {node.endTime.toFixed(1)}s</span>
                        <span>Total: {node.duration.toFixed(1)}s</span>
                      </div>
                      
                      <div className="dual-slider-container" style={{ margin: '4px 0' }}>
                        <div className="dual-slider-track" />
                        <div 
                          className="dual-slider-active-track" 
                          style={{
                            left: `${(node.startTime / node.duration) * 100}%`,
                            right: `${100 - (node.endTime / node.duration) * 100}%`,
                            background: node.type === 'audio' ? 'var(--accent-pink)' : 'var(--accent-cyan)'
                          }}
                        />
                        <input 
                          type="range"
                          min="0"
                          max={node.duration}
                          step="0.1"
                          value={node.startTime}
                          onChange={(e) => handleTrimChange(node.id, 'start', e.target.value)}
                          className="trim-slider"
                          style={{ position: 'absolute', zIndex: 10 }}
                        />
                        <input 
                          type="range"
                          min="0"
                          max={node.duration}
                          step="0.1"
                          value={node.endTime}
                          onChange={(e) => handleTrimChange(node.id, 'end', e.target.value)}
                          className="trim-slider"
                          style={{ position: 'absolute', zIndex: 11 }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', marginBottom: '2px' }}>
                        {node.type === 'video' ? (
                          <button 
                            onClick={() => toggleMuteVideo(node.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              display: 'flex'
                            }}
                          >
                            {node.volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
                          </button>
                        ) : (
                          <div style={{ width: '12px' }} />
                        )}
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Trim Loop Active</span>
                      </div>
                    </>
                  )}

                  {/* Filter Dropdown for Image and Video */}
                  {(node.type === 'video' || node.type === 'image') && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '2px' }}>
                      <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Visual Filter:</span>
                      <select
                        value={node.filter || 'normal'}
                        onChange={(e) => updateNodeFilter(node.id, e.target.value)}
                        className="select-nle-framerate"
                        style={{ padding: '3px 6px', fontSize: '9px', width: 'auto' }}
                      >
                        <option value="normal">Normal</option>
                        <option value="grayscale">Grayscale</option>
                        <option value="sepia">Sepia</option>
                        <option value="vintage">Vintage</option>
                        <option value="cyberpunk">Cyberpunk</option>
                        <option value="noir">Noir</option>
                        <option value="blur">Blur</option>
                      </select>
                    </div>
                  )}

                  {/* Speed Multiplier for Video and Audio */}
                  {(node.type === 'video' || node.type === 'audio') && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginTop: '4px' }}>
                      <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Clip Speed:</span>
                      <select
                        value={node.speed || 1.0}
                        onChange={(e) => updateNodeSpeed(node.id, e.target.value)}
                        className="select-nle-framerate"
                        style={{ padding: '3px 6px', fontSize: '9px', width: 'auto' }}
                      >
                        <option value={0.25}>0.25x (Slow)</option>
                        <option value={0.5}>0.50x (Half)</option>
                        <option value={1.0}>1.00x (Normal)</option>
                        <option value={1.5}>1.50x (Fast)</option>
                        <option value={2.0}>2.00x (Double)</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

      </div>

      {/* Floating Canvas UI hints */}
      <div 
        style={{
          position: 'absolute',
          top: '20px',
          right: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          pointerEvents: 'auto'
        }}
      >
        <div 
          className="glass-panel" 
          style={{
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '11px',
            color: 'var(--text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-cyan)' }}></span>
            <span>Zoom: {Math.round(zoom * 100)}%</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)' }}></span>
            <span>Space + Drag to Pan</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)' }}></span>
            <span>Double Click to add note</span>
          </div>
        </div>
      </div>

      {/* Folder Import Preview Modal */}
      {importFolderData && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'auto'
          }}
        >
          <div 
            className="glass-panel"
            style={{
              width: '460px',
              maxHeight: '80%',
              borderRadius: '16px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 10px 50px rgba(0,0,0,0.8)'
            }}
          >
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-glass)'
              }}
            >
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '16px' }}>
                Import Folder: {importFolderData.name}
              </h3>
              <button 
                onClick={() => setImportFolderData(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Select files to import onto the canvas. Discovered {importFolderData.files.length} media files:
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {importFolderData.files.map((file, idx) => {
                  const isChecked = selectedImportIndices.includes(idx);
                  return (
                    <div 
                      key={idx}
                      onClick={() => {
                        setSelectedImportIndices(prev => 
                          isChecked ? prev.filter(i => i !== idx) : [...prev, idx]
                        );
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: isChecked ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${isChecked ? 'rgba(59, 130, 246, 0.3)' : 'var(--border-glass)'}`,
                        cursor: 'pointer',
                        transition: 'background 0.2s ease'
                      }}
                    >
                      <div 
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '4px',
                          border: '1px solid var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: isChecked ? 'var(--accent-blue)' : 'transparent',
                          borderColor: isChecked ? 'var(--accent-blue)' : 'var(--text-muted)'
                        }}
                      >
                        {isChecked && <Check size={12} color="white" />}
                      </div>
                      
                      {file.type === 'video' && <Video size={14} style={{ color: 'var(--accent-cyan)' }} />}
                      {file.type === 'audio' && <Music size={14} style={{ color: 'var(--accent-pink)' }} />}
                      {file.type === 'image' && <ImageIcon size={14} style={{ color: 'var(--accent-purple)' }} />}
                      
                      <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {file.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div 
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '12px',
                padding: '16px 20px',
                background: 'rgba(0,0,0,0.2)',
                borderTop: '1px solid var(--border-glass)'
              }}
            >
              <button 
                onClick={() => setImportFolderData(null)}
                style={{
                  background: 'none',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '6px',
                  color: 'var(--text-secondary)',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmImport}
                style={{
                  background: 'var(--accent-blue)',
                  border: 'none',
                  borderRadius: '6px',
                  color: 'white',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500
                }}
              >
                Import Selected ({selectedImportIndices.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Canvas Mini-map */}
      <div 
        className="minimap-container" 
        style={{ 
          bottom: '24px',
          right: '24px',
          transform: isMiniMapOpen ? 'scale(1)' : 'scale(0.85)',
          opacity: isMiniMapOpen ? 1 : 0.6,
          height: isMiniMapOpen ? '135px' : '32px',
          width: '160px',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, height 0.3s ease'
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div 
          className="minimap-header"
          onClick={(e) => {
            e.stopPropagation();
            setIsMiniMapOpen(prev => !prev);
            playUISound('change');
          }}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Map size={10} style={{ color: 'var(--accent-cyan)' }} />
            <span style={{ whiteSpace: 'nowrap' }}>Mini-map</span>
          </div>
          <button 
            type="button"
            className="minimap-toggle-btn"
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            title={isMiniMapOpen ? "Collapse Mini-map" : "Expand Mini-map"}
          >
            {isMiniMapOpen ? <Minimize2 size={10} /> : <Map size={10} />}
          </button>
        </div>
        
        {isMiniMapOpen && (
          <div 
            className="minimap-svg-container"
            style={{ 
              flex: 1, 
              position: 'relative', 
              background: 'rgba(0, 0, 0, 0.15)',
              cursor: 'crosshair',
              padding: '8px 10px 10px 10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseDown={handleMiniMapMouseDown}
          >
            <svg 
              width="140" 
              height="90"
              style={{ overflow: 'visible' }}
            >
              {/* Draw node approximations inside mini-map */}
              {miniMapData.mapNodes.map(mNode => {
                const isSel = selectedNodeId === mNode.id;
                return (
                  <rect
                    key={mNode.id}
                    x={mNode.x}
                    y={mNode.y}
                    width={mNode.w}
                    height={mNode.h}
                    fill={mNode.color || 'var(--accent-purple)'}
                    className={`minimap-node-rect ${isSel ? 'selected' : ''}`}
                  />
                );
              })}
              
              {/* Draw active viewport indicator */}
              <rect
                x={miniMapData.viewportBox.x}
                y={miniMapData.viewportBox.y}
                width={miniMapData.viewportBox.w}
                height={miniMapData.viewportBox.h}
                className="minimap-viewport-box"
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { FolderOpen, Film } from 'lucide-react';
import DirectoryExplorer from './components/DirectoryExplorer';
import Canvas from './components/Canvas';
import Timeline from './components/Timeline';
import { parseFcpXml } from './utils/fcpXmlParser';
import { playUISound } from './utils/audioSynth';

const INITIAL_NODES = [
  // ── V-TRACK: Main edit (left → right) ────────────────────────
  {
    id: 'clip-1',
    type: 'video',
    name: 'SC01 — Wide Establishing',
    url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    x: 80,
    y: 80,
    width: 260,
    startTime: 0,
    endTime: 8,
    duration: 52,
    volume: 0.7,
    speed: 1.0,
    filter: 'normal',
    locked: false,
    color: 'var(--accent-cyan)'
  },
  {
    id: 'clip-2',
    type: 'video',
    name: 'SC02 — Hero Close-up',
    url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    x: 420,
    y: 60,
    width: 240,
    startTime: 12,
    endTime: 22,
    duration: 52,
    volume: 0.8,
    speed: 1.0,
    filter: 'vintage',
    locked: false,
    color: 'var(--accent-purple)'
  },
  {
    id: 'clip-3',
    type: 'video',
    name: 'SC03 — Battle Sequence',
    url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    x: 740,
    y: 80,
    width: 250,
    startTime: 28,
    endTime: 40,
    duration: 52,
    volume: 0.9,
    speed: 1.0,
    filter: 'cyberpunk',
    locked: false,
    color: 'var(--accent-blue)'
  },
  // ── B-TRACK: Cutaways + Audio (lower row) ────────────────────
  {
    id: 'clip-4',
    type: 'video',
    name: 'B-Roll — Slo-Mo Insert',
    url: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
    x: 420,
    y: 320,
    width: 230,
    startTime: 4,
    endTime: 14,
    duration: 33,
    volume: 0.3,
    speed: 0.5,
    filter: 'noir',
    locked: false,
    color: 'var(--accent-green)'
  },
  {
    id: 'audio-1',
    type: 'audio',
    name: 'Epic Cinematic Trailer Score',
    url: 'https://assets.mixkit.co/music/preview/mixkit-epic-story-1078.mp3',
    x: 740,
    y: 330,
    width: 250,
    startTime: 0,
    endTime: 40,
    duration: 107,
    timelineStart: 0,
    volume: 0.4,
    speed: 1.0,
    locked: false,
    fadeIn: 1.5,
    fadeOut: 1.5,
    loop: true,
    color: 'var(--accent-pink)'
  },
  {
    id: 'note-1',
    type: 'sticky',
    name: 'Edit Notes — v3',
    text: '📋 ROUGH CUT v3 — Sintel Short\n\nSC01 wide → SC02 close-up: FADE 1.5s\nSC02 → SC03 battle: SLIDE 1s\nSC03 → B-Roll cutaway: ZOOM 0.8s\nB-Roll → Score: DISSOLVE\n\n⚠️ TODO: Trim SC03 tail by 2s\n✂️ Split B-Roll at 8s mark\n🎵 Score volume → −12dB',
    x: 80,
    y: 330,
    width: 270,
    locked: false,
    color: '#E2DCD2'
  }
];

/*
 *   ┌─────────────┐     fade      ┌──────────────┐    slide     ┌──────────────────┐
 *   │ SC01 — Wide │ ──────────▶  │ SC02 — CU    │ ──────────▶ │ SC03 — Battle    │
 *   │ 0s → 8s     │     1.5s     │ 12s → 22s    │    1.0s     │ 28s → 40s        │
 *   └──────┬──────┘              └──────────────┘              └────────┬─────────┘
 *          │ none                                                       │ zoom 0.8s
 *          ▼                                                            ▼
 *   ┌──────────────┐             ┌──────────────┐  dissolve  ┌──────────────────┐
 *   │ Edit Notes   │             │ B-Roll SloMo │ ─────────▶ │ Orchestral Score │
 *   │ (sticky)     │             │ 4s→14s @0.5x │    1.2s    │ 0s → 20s         │
 *   └──────────────┘             └──────────────┘            └──────────────────┘
 */
const INITIAL_CONNECTIONS = [
  { id: 'conn-1', from: 'clip-1', to: 'clip-2',  transition: 'fade',     duration: 1.5 },
  { id: 'conn-2', from: 'clip-2', to: 'clip-3',  transition: 'slide',    duration: 1.0 },
  { id: 'conn-3', from: 'clip-3', to: 'clip-4',  transition: 'zoom',     duration: 0.8 },
  { id: 'conn-4', from: 'clip-4', to: 'audio-1', transition: 'dissolve', duration: 1.2 },
  { id: 'conn-5', from: 'clip-1', to: 'note-1',  transition: 'none',     duration: 0   }
];

export default function App() {
  // Shared state variables
  const [nodes, setNodes] = useState([]);
  const [connections, setConnections] = useState([]);
  const [draggedItem, setDraggedItem] = useState(null); // { kind: 'file'|'directory', handle, name, type }
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [activeFolderHandle, setActiveFolderHandle] = useState(null);
  const [isPresentationActive, setIsPresentationActive] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isTimelineOpen, setIsTimelineOpen] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [timelineKey, setTimelineKey] = useState(0);

  const handleLoadProjectFile = (xmlText) => {
    try {
      const { nodes: parsedNodes, connections: parsedConnections } = parseFcpXml(xmlText);
      if (parsedNodes && parsedNodes.length > 0) {
        playUISound('swell');
        setNodes(parsedNodes);
        setConnections(parsedConnections);
        setIsPlaying(false);
        setTimelineKey(prev => prev + 1);
        return true;
      }
      return false;
    } catch (err) {
      console.error("Failed to parse imported XML file:", err);
      return false;
    }
  };

  // Drag handlers to coordinate explorer dragging actions
  const handleFileDragStart = (e, file) => {
    setDraggedItem({
      kind: 'file',
      handle: file.handle,
      name: file.name,
      type: file.type
    });
  };

  const handleFolderDragStart = (e, folderHandle) => {
    setDraggedItem({
      kind: 'directory',
      handle: folderHandle,
      name: folderHandle.name
    });
  };

  return (
    <div className="app-container">
      <Canvas 
        nodes={nodes}
        setNodes={setNodes}
        connections={connections}
        setConnections={setConnections}
        draggedItem={draggedItem}
        setDraggedItem={setDraggedItem}
        selectedNodeId={selectedNodeId}
        setSelectedNodeId={setSelectedNodeId}
        isPresentationActive={isPresentationActive}
        isSidebarOpen={isSidebarOpen}
        isPlaying={isPlaying}
        activeNodeId={activeNodeId}
        isTimelineOpen={isTimelineOpen}
        aspectRatio={aspectRatio}
        onLoadProjectFile={handleLoadProjectFile}
      />

      {/* Hide panels when Presentation Mode is running */}
      {!isPresentationActive && (
        <DirectoryExplorer 
          onFileDragStart={handleFileDragStart}
          onFolderDragStart={handleFolderDragStart}
          activeFolderHandle={activeFolderHandle}
          setActiveFolderHandle={setActiveFolderHandle}
          isSidebarOpen={isSidebarOpen}
          onCollapse={() => setIsSidebarOpen(false)}
          onLoadProjectFile={handleLoadProjectFile}
        />
      )}
      
      {/* Re-open Sidebar Floating Button */}
      {!isPresentationActive && !isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          onDoubleClick={(e) => e.stopPropagation()}
          className="glass-panel"
          style={{
            position: 'absolute',
            left: '20px',
            top: '20px',
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            zIndex: 100,
            transition: 'transform 0.2s ease, background-color 0.2s',
            pointerEvents: 'auto',
            border: '1px solid var(--border-glass)',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Open Directory Explorer"
        >
          <FolderOpen size={18} style={{ color: 'var(--accent-blue)' }} />
        </button>
      )}

      <Timeline 
        key={timelineKey}
        nodes={nodes}
        setNodes={setNodes}
        connections={connections}
        setConnections={setConnections}
        selectedNodeId={selectedNodeId}
        setSelectedNodeId={setSelectedNodeId}
        isPresentationActive={isPresentationActive}
        setIsPresentationActive={setIsPresentationActive}
        isSidebarOpen={isSidebarOpen}
        isTimelineOpen={isTimelineOpen}
        onCollapse={() => setIsTimelineOpen(false)}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        activeNodeId={activeNodeId}
        setActiveNodeId={setActiveNodeId}
        aspectRatio={aspectRatio}
        setAspectRatio={setAspectRatio}
        onLoadProjectFile={handleLoadProjectFile}
      />

      {/* Re-open Timeline Floating Button */}
      {!isPresentationActive && !isTimelineOpen && (
        <button
          onClick={() => setIsTimelineOpen(true)}
          onDoubleClick={(e) => e.stopPropagation()}
          className="glass-panel"
          style={{
            position: 'absolute',
            left: isSidebarOpen ? '300px' : '24px',
            bottom: '24px',
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-primary)',
            zIndex: 100,
            transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s ease, background-color 0.2s',
            pointerEvents: 'auto',
            border: '1px solid var(--border-glass)',
            outline: 'none'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          title="Open Timeline"
        >
          <Film size={18} style={{ color: 'var(--accent-cyan)' }} />
        </button>
      )}
    </div>
  );
}

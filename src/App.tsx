import React, { useState, useRef, useEffect } from 'react';
import ForceGraph2D, { ForceGraphProps } from 'react-force-graph-2d';
import { Loader2, Play, AlertCircle, Share2, ZoomIn, ZoomOut, Maximize, X, Search, Download, Image as ImageIcon, Undo2, Link, Upload, RotateCcw, Settings, Eye, EyeOff, Check, Menu } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// --- Utility Functions ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type NodeType = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  color?: string;
  val?: number;
};

type LinkType = {
  source: string | NodeType;
  target: string | NodeType;
  label: string;
};

type GraphData = {
  nodes: NodeType[];
  links: LinkType[];
};

// --- Constants ---
const NODE_COLORS: Record<string, string> = {
  Person: '#00FF66',
  Organization: '#00FF66',
  Tool: '#FFFFFF',
  Concept: '#FFFFFF',
  Other: '#666666',
};

const DEFAULT_GRAPH: GraphData = {
  nodes: [
    { id: 'OpenAI', type: 'Organization' },
    { id: 'GPT Models', type: 'Tool' },
    { id: 'Developers', type: 'Person' },
    { id: 'APIs', type: 'Tool' },
    { id: 'Applications', type: 'Concept' },
  ],
  links: [
    { source: 'OpenAI', target: 'GPT Models', label: 'develops' },
    { source: 'Developers', target: 'APIs', label: 'use' },
    { source: 'APIs', target: 'Applications', label: 'build' },
  ],
};

// --- Components ---
export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputText, setInputText] = useState('');
  const [graphData, setGraphData] = useState<GraphData>(DEFAULT_GRAPH);
  const [graphHistory, setGraphHistory] = useState<GraphData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isScrapingUrl, setIsScrapingUrl] = useState(false);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const [hoverNode, setHoverNode] = useState<NodeType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodeType | null>(null);
  const [nodeDetails, setNodeDetails] = useState<Record<string, string>>({});
  const [isExplaining, setIsExplaining] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // API Settings
  const [showSettings, setShowSettings] = useState(false);
  const [hfToken, setHfToken] = useState(() => localStorage.getItem('hf_token') || '');
  const [orKey, setOrKey] = useState(() => localStorage.getItem('or_key') || '');
  const [showHfToken, setShowHfToken] = useState(false);
  const [showOrKey, setShowOrKey] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const handleSaveSettings = async () => {
    localStorage.setItem('hf_token', hfToken);
    localStorage.setItem('or_key', orKey);
    // Send keys to server
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hfToken, orKey }),
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  };

  const handleNodeHover = (node: NodeType | null) => {
    setHoverNode(node);
    if (containerRef.current) {
      containerRef.current.style.cursor = node ? 'pointer' : 'default';
    }
  };

  const handleNodeClick = async (node: any) => {
    setSelectedNode(node);
    if (nodeDetails[node.id]) return;

    setIsExplaining(true);
    try {
        const response = await fetch("/api/explain", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nodeId: node.id, nodeType: node.type, context: inputText }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to fetch explanation");
        
        setNodeDetails(prev => ({ ...prev, [node.id]: data.text || "No explanation available." }));
    } catch (err) {
        console.error(err);
        setNodeDetails(prev => ({ ...prev, [node.id]: "Error loading explanation." }));
    } finally {
        setIsExplaining(false);
    }
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    if (!query || !graphData.nodes.length) return;
    
    const found = graphData.nodes.find(n => n.id && n.id.toLowerCase().includes(query.toLowerCase()));
    if (found && graphRef.current && found.x !== undefined && found.y !== undefined) {
        graphRef.current.centerAt(found.x, found.y, 500);
        graphRef.current.zoom(4, 500);
        setHoverNode(found);
    }
  };

  const handleScrapeUrl = async () => {
    if (!urlInput.trim()) return;
    setIsScrapingUrl(true);
    setError(null);
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to scrape URL");
      setInputText(data.text);
      setUrlInput('');
    } catch (err: any) {
      setError(err.message || "Failed to scrape URL");
    } finally {
      setIsScrapingUrl(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingFile(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to process file");
      setInputText(data.text);
    } catch (err: any) {
      setError(err.message || "Failed to process file");
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleUndo = () => {
    if (graphHistory.length === 0) return;
    const prev = graphHistory[graphHistory.length - 1];
    setGraphHistory(h => h.slice(0, -1));
    setGraphData(prev);
    setSelectedNode(null);
    setHoverNode(null);
    setTimeout(() => graphRef.current?.zoomToFit(400, 50), 300);
  };

  const exportJSON = () => {
    try {
        const cleanData = {
           nodes: graphData.nodes.map(n => ({ id: n.id, type: n.type })),
           links: graphData.links.map(l => ({ 
               source: typeof l.source === 'object' ? (l.source as any).id : l.source, 
               target: typeof l.target === 'object' ? (l.target as any).id : l.target, 
               label: l.label 
           }))
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanData, null, 2));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "knowledge_graph.json");
        dlAnchorElem.click();
    } catch (err) {
        console.error("Export failed:", err);
    }
  };

  const exportPNG = () => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (canvas) {
        const dataURL = canvas.toDataURL('image/png');
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataURL);
        dlAnchorElem.setAttribute("download", "knowledge_graph.png");
        dlAnchorElem.click();
    }
  };
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const graphRef = useRef<any>(null);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Customize the d3 forces to spread the nodes nicely
    if (graphRef.current) {
      const chargeForce = graphRef.current.d3Force('charge');
      const linkForce = graphRef.current.d3Force('link');
      if (chargeForce) chargeForce.strength(-500);
      if (linkForce) linkForce.distance(150);
      
      // Warm up the simulation slightly when data changes
      graphRef.current.d3ReheatSimulation();
    }
  }, [graphData]);

  const handleGenerateGraph = async () => {
    if (!inputText.trim()) {
      setError("Please enter some text to analyze.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputText })
      });
      
      const data = await response.json();
      if (!response.ok) {
          throw new Error(data.error || "Failed to extract graph data.");
      }

      if (!data.nodes || !data.links) {
        throw new Error("Invalid graph structure returned from backend.");
      }
      
      // Save current graph to history before updating
      setGraphHistory(h => [...h, graphData]);

      setGraphData({
          nodes: data.nodes,
          links: data.links
      });

      // Reset contextual states
      setHoverNode(null);
      setSelectedNode(null);
      setSearchQuery('');
      // Close sidebar on mobile after extraction
      if (window.innerWidth < 768) setSidebarOpen(false);
      
      // Zoom to fit after a short delay
      setTimeout(() => {
        if (graphRef.current) {
            graphRef.current.zoomToFit(400, 50);
        }
      }, 500);

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while generating the graph.");
    } finally {
      setIsLoading(false);
    }
  };

  const drawNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const isHovered = hoverNode?.id === node.id;
    const isNeighbor = hoverNode && graphData.links.some((l: any) => 
        ((l.source.id ?? l.source) === hoverNode.id && (l.target.id ?? l.target) === node.id) ||
        ((l.target.id ?? l.target) === hoverNode.id && (l.source.id ?? l.source) === node.id)
    );
    const isDimmed = hoverNode && !isHovered && !isNeighbor;

    ctx.save();
    ctx.globalAlpha = isDimmed ? 0.2 : 1;

    const label = node.id;
    const fontSize = 13 / globalScale;
    ctx.font = `500 ${fontSize}px 'Helvetica Neue', Arial, sans-serif`;
    const textWidth = ctx.measureText(label).width;
    const paddingX = 12 / globalScale;
    const paddingY = 8 / globalScale;
    const bckgDimensions = [textWidth + paddingX * 2, fontSize + paddingY * 2] as [number, number];

    let borderColor = NODE_COLORS[node.type] || '#333333';
    const textColor = NODE_COLORS[node.type] || '#FFFFFF';
    const isPrimary = borderColor === '#00FF66';

    if (isHovered) {
        borderColor = '#FFFFFF';
    }

    if (isPrimary || isHovered) {
        ctx.shadowColor = isHovered ? '#FFFFFF' : 'rgba(0, 255, 102, 0.2)';
        ctx.shadowBlur = (isHovered ? 20 : 15) / globalScale;
    } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }

    ctx.fillStyle = '#0A0A0A';
    ctx.beginPath();
    ctx.roundRect(
      node.x - bckgDimensions[0] / 2, 
      node.y - bckgDimensions[1] / 2, 
      bckgDimensions[0], 
      bckgDimensions[1],
      [4/globalScale]
    );
    ctx.fill();
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = (isHovered ? 2 : 1) / globalScale;
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = textColor;
    ctx.fillText(label, node.x, node.y);

    ctx.restore();
    node.__bckgDimensions = bckgDimensions;
  };

  const drawLink = (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!link.source.x || !link.target.x) return;
      
      const isHighlighted = hoverNode && ((link.source.id ?? link.source) === hoverNode.id || (link.target.id ?? link.target) === hoverNode.id);
      const isDimmed = hoverNode && !isHighlighted;

      ctx.save();
      ctx.globalAlpha = isDimmed ? 0.2 : 1;

      // Draw line
      ctx.beginPath();
      ctx.moveTo(link.source.x, link.source.y);
      ctx.lineTo(link.target.x, link.target.y);
      ctx.strokeStyle = isHighlighted ? '#00FF66' : '#333333';
      ctx.lineWidth = (isHighlighted ? 2 : 1) / globalScale;
      ctx.stroke();

      // Draw label
      const MAX_FONT_SIZE = 9;
      const LABEL_NODE_MARGIN = 15;

      const start = link.source;
      const end = link.target;

      // ignore unbound links
      if (typeof start !== 'object' || typeof end !== 'object') {
          ctx.restore();
          return;
      }

      // calculate label positioning
      const textPos = Object.assign({}, ...['x', 'y'].map(c => ({
        [c]: start[c] + (end[c] - start[c]) / 2 // calc middle point
      })));

      const relLink = { x: end.x - start.x, y: end.y - start.y };
      const maxTextLength = Math.sqrt(Math.pow(relLink.x, 2) + Math.pow(relLink.y, 2)) - LABEL_NODE_MARGIN * 2;

      let textAngle = Math.atan2(relLink.y, relLink.x);
      // maintain label vertical orientation for legibility
      if (textAngle > Math.PI / 2) textAngle = -(Math.PI - textAngle);
      if (textAngle < -Math.PI / 2) textAngle = -(-Math.PI - textAngle);

      const label = link.label.toUpperCase();

      const fontSize = Math.min(MAX_FONT_SIZE / globalScale, 9 / globalScale);

      ctx.font = `${fontSize}px 'Courier New', monospace`;
      const textWidth = ctx.measureText(label).width;
      
      ctx.save();
      ctx.translate(textPos.x, textPos.y);
      ctx.rotate(textAngle);

      // Label background
      ctx.fillStyle = '#0A0A0A';
      const bgPadding = 2 / globalScale;
      ctx.fillRect(-textWidth/2 - bgPadding, -fontSize/2 - bgPadding, textWidth + bgPadding*2, fontSize + bgPadding*2);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isHighlighted ? '#FFFFFF' : '#666666';
      ctx.fillText(label, 0, 0);

      ctx.restore(); // restore label translate/rotate
      ctx.restore(); // restore globalAlpha
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#0A0A0A] text-[#FFFFFF] font-['Helvetica_Neue',_Arial,_sans-serif] overflow-hidden">
      
      {/* Header */}
      <header className="h-[60px] md:h-[100px] border-b border-[#333333] flex items-end px-4 md:px-[40px] pb-3 md:pb-[20px] shrink-0">
        <div className="flex items-end mt-auto w-full">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden bg-transparent border-none text-white cursor-pointer p-1 mr-3 mb-1"
          >
            <Menu size={22} />
          </button>
          <Share2 className="w-7 h-7 md:w-10 md:h-10 text-[#00FF66] mr-3 md:mr-4 mb-1 md:mb-2" />
          <h1 className="text-[32px] md:text-[64px] font-black tracking-[-2px] md:tracking-[-4px] leading-[0.8] uppercase m-0 p-0 text-white">
            Extractor
          </h1>
          <p className="text-[#00FF66] font-['Courier_New',_monospace] text-[10px] md:text-[14px] ml-2 md:ml-[20px] uppercase mb-[3px] md:mb-[5px] hidden sm:block">
            Structured Knowledge v2.0
          </p>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Mobile overlay backdrop */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-20"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Parameters Sidebar */}
        <div className={cn(
          "flex flex-col border-r border-[#333333] p-5 md:p-[30px] z-30 flex-shrink-0 overflow-y-auto bg-[#0A0A0A] transition-transform duration-200",
          "fixed md:relative inset-y-0 left-0 w-[300px] md:w-[340px]",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}>
          
          <div className="space-y-3 mb-6">
            <div className="text-[11px] uppercase tracking-[2px] text-[#666666] mb-[25px] flex items-center">
              Source Text
              <div className="flex-1 h-[1px] bg-[#333333] ml-[10px]"></div>
            </div>
            <textarea
              id="source-text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="w-full h-48 sm:h-64 rounded-none border border-[#333333] bg-[#0A0A0A] p-4 text-[12px] font-['Courier_New',_monospace] text-[#BBB] resize-none focus:outline-none focus:border-[#00FF66] transition-all placeholder:text-[#666666]"
              placeholder="Paste text here to extract entities and relationships... e.g. OpenAI develops GPT models. Developers use APIs to build applications."
            />

            {/* URL Input */}
            <div className="flex gap-1">
              <div className="relative flex-1">
                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#666666]" />
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScrapeUrl()}
                  placeholder="Paste URL to scrape..."
                  className="w-full rounded-none border border-[#333333] bg-[#0A0A0A] py-2 pl-9 pr-3 text-[11px] font-['Courier_New',_monospace] text-white focus:outline-none focus:border-[#00FF66] placeholder:text-[#666666]"
                />
              </div>
              <button
                onClick={handleScrapeUrl}
                disabled={isScrapingUrl || !urlInput.trim()}
                className="bg-[#111] hover:bg-[#222] border border-[#333333] text-white text-[10px] font-['Courier_New',_monospace] px-3 py-2 cursor-pointer disabled:opacity-50 transition-colors shrink-0"
              >
                {isScrapingUrl ? <Loader2 size={12} className="animate-spin" /> : "GO"}
              </button>
            </div>

            {/* File Upload */}
            <input ref={fileInputRef} type="file" accept=".pdf,.txt,.md" onChange={handleFileUpload} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingFile}
              className="w-full bg-[#111] hover:bg-[#222] border border-[#333333] text-white text-[11px] font-['Courier_New',_monospace] flex items-center justify-center gap-2 py-2 px-3 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isUploadingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Upload PDF / TXT
            </button>
          </div>

          <div className="space-y-3 mb-6">
            <div className="text-[11px] uppercase tracking-[2px] text-[#666666] mb-[25px] flex items-center">
              Search Graph
              <div className="flex-1 h-[1px] bg-[#333333] ml-[10px]"></div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666]" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearch}
                placeholder="Find a node..."
                className="w-full rounded-none border border-[#333333] bg-[#0A0A0A] py-3 pl-10 pr-4 text-[12px] font-['Courier_New',_monospace] text-white focus:outline-none focus:border-[#00FF66] placeholder:text-[#666666]"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleGenerateGraph}
              disabled={isLoading || !inputText.trim()}
              className="flex-1 bg-white text-[#0A0A0A] font-black uppercase text-[14px] tracking-wider py-[10px] px-[20px] border-none cursor-pointer flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#e0e0e0] active:scale-[0.98]"
              id="generate-button"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  Extract
                </>
              )}
            </button>
            <button
              onClick={handleUndo}
              disabled={graphHistory.length === 0}
              className="bg-[#111] hover:bg-[#222] border border-[#333333] text-white px-3 cursor-pointer disabled:opacity-30 transition-colors"
              title={`Undo (${graphHistory.length} steps)`}
            >
              <Undo2 size={18} />
            </button>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-[#111] text-[#FF3366] rounded-none border-l-2 border-[#FF3366] flex gap-3 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="leading-relaxed font-['Courier_New',_monospace]">{error}</p>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-8">

             {/* Graph Stats */}
             {graphData.nodes.length > 0 && (
               <div>
                 <div className="text-[11px] uppercase tracking-[2px] text-[#666666] mb-[15px] flex items-center">
                   Graph Stats
                   <div className="flex-1 h-[1px] bg-[#333333] ml-[10px]"></div>
                 </div>
                 <div className="grid grid-cols-2 gap-3">
                   <div className="border border-[#333333] p-3 text-center">
                     <div className="text-[20px] font-black text-[#00FF66]">{graphData.nodes.length}</div>
                     <div className="text-[10px] uppercase tracking-wider text-[#666666] font-['Courier_New',_monospace]">Entities</div>
                   </div>
                   <div className="border border-[#333333] p-3 text-center">
                     <div className="text-[20px] font-black text-[#00FF66]">{graphData.links.length}</div>
                     <div className="text-[10px] uppercase tracking-wider text-[#666666] font-['Courier_New',_monospace]">Relations</div>
                   </div>
                 </div>
               </div>
             )}

             <div>
               <div className="text-[11px] uppercase tracking-[2px] text-[#666666] mb-[25px] flex items-center">
                 Entity Legend
                 <div className="flex-1 h-[1px] bg-[#333333] ml-[10px]"></div>
               </div>
               <div className="flex flex-col gap-4">
                  {Object.entries(NODE_COLORS).map(([type, color], idx) => (
                      <div key={type} className="pl-[15px] border-l-2 relative h-full flex items-center" style={{ borderColor: color === '#666666' ? '#333333' : color }}>
                          <span className="absolute left-[-30px] top-1 font-['Courier_New',_monospace] text-[10px] text-[#666666]">
                             0{idx + 1}
                          </span>
                          <h3 className="text-[14px] text-white m-0 tracking-wide font-medium">{type}</h3>
                      </div>
                  ))}
               </div>
             </div>

             <div>
               <div className="text-[11px] uppercase tracking-[2px] text-[#666666] mb-[25px] flex items-center">
                 Export
                 <div className="flex-1 h-[1px] bg-[#333333] ml-[10px]"></div>
               </div>
               <div className="grid grid-cols-2 gap-2">
                 <button onClick={exportJSON} className="bg-[#111] hover:bg-[#222] border border-[#333333] text-white text-[11px] font-['Courier_New',_monospace] flex items-center justify-center gap-2 py-2 px-3 transition-colors cursor-pointer disabled:opacity-50" disabled={graphData.nodes.length === 0}>
                   <Download size={14} /> JSON
                 </button>
                 <button onClick={exportPNG} className="bg-[#111] hover:bg-[#222] border border-[#333333] text-white text-[11px] font-['Courier_New',_monospace] flex items-center justify-center gap-2 py-2 px-3 transition-colors cursor-pointer disabled:opacity-50" disabled={graphData.nodes.length === 0}>
                   <ImageIcon size={14} /> PNG
                 </button>
               </div>
             </div>

             {/* API Settings */}
             <div>
               <button
                 onClick={() => setShowSettings(!showSettings)}
                 className="w-full text-[11px] uppercase tracking-[2px] text-[#666666] mb-[15px] flex items-center cursor-pointer bg-transparent border-none p-0 hover:text-white transition-colors"
               >
                 <Settings size={12} className="mr-2" />
                 API Settings
                 <div className="flex-1 h-[1px] bg-[#333333] ml-[10px]"></div>
               </button>
               {showSettings && (
                 <div className="space-y-3">
                   <div>
                     <label className="text-[10px] uppercase tracking-wider text-[#666666] font-['Courier_New',_monospace] mb-1 block">Hugging Face Token</label>
                     <div className="relative">
                       <input
                         type={showHfToken ? 'text' : 'password'}
                         value={hfToken}
                         onChange={(e) => setHfToken(e.target.value)}
                         placeholder="hf_..."
                         className="w-full rounded-none border border-[#333333] bg-[#0A0A0A] py-2 pl-3 pr-9 text-[11px] font-['Courier_New',_monospace] text-white focus:outline-none focus:border-[#00FF66] placeholder:text-[#444]"
                       />
                       <button onClick={() => setShowHfToken(!showHfToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666] hover:text-white bg-transparent border-none cursor-pointer p-0.5">
                         {showHfToken ? <EyeOff size={13} /> : <Eye size={13} />}
                       </button>
                     </div>
                   </div>
                   <div>
                     <label className="text-[10px] uppercase tracking-wider text-[#666666] font-['Courier_New',_monospace] mb-1 block">OpenRouter API Key</label>
                     <div className="relative">
                       <input
                         type={showOrKey ? 'text' : 'password'}
                         value={orKey}
                         onChange={(e) => setOrKey(e.target.value)}
                         placeholder="sk-or-..."
                         className="w-full rounded-none border border-[#333333] bg-[#0A0A0A] py-2 pl-3 pr-9 text-[11px] font-['Courier_New',_monospace] text-white focus:outline-none focus:border-[#00FF66] placeholder:text-[#444]"
                       />
                       <button onClick={() => setShowOrKey(!showOrKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666] hover:text-white bg-transparent border-none cursor-pointer p-0.5">
                         {showOrKey ? <EyeOff size={13} /> : <Eye size={13} />}
                       </button>
                     </div>
                   </div>
                   <button
                     onClick={handleSaveSettings}
                     className="w-full bg-[#111] hover:bg-[#222] border border-[#333333] text-white text-[11px] font-['Courier_New',_monospace] flex items-center justify-center gap-2 py-2 px-3 transition-colors cursor-pointer"
                   >
                     {settingsSaved ? <><Check size={14} className="text-[#00FF66]" /> Saved</> : <><Settings size={14} /> Save Keys</>}
                   </button>
                   <p className="text-[9px] text-[#555] font-['Courier_New',_monospace] leading-relaxed">
                     Keys are stored locally and sent to the server. Get free keys at huggingface.co and openrouter.ai
                   </p>
                 </div>
               )}
             </div>
          </div>

        </div>

        {/* Main Canvas Area */}
        <div id="main-canvas-area" className="flex-1 relative flex items-center justify-center overflow-hidden" style={{ background: 'radial-gradient(circle at center, #111 0%, #0A0A0A 100%)' }} ref={containerRef}>
          
          {/* Canvas overlays */}
          <div id="canvas-controls" className="absolute top-3 right-3 md:top-[30px] md:right-[30px] z-20 flex bg-[#0A0A0A] border border-[#333333] rounded-none shadow-sm overflow-hidden text-[#FFFFFF]">
              <button 
                  onClick={() => graphRef.current?.zoom(graphRef.current.zoom() * 1.2, 400)}
                  className="p-2.5 hover:bg-[#1a1a1a] transition-colors border-r border-[#333333] cursor-pointer"
                  title="Zoom In"
                  id="zoom-in"
              >
                  <ZoomIn className="w-4 h-4" />
              </button>
              <button 
                  onClick={() => graphRef.current?.zoom(graphRef.current.zoom() / 1.2, 400)}
                  className="p-2.5 hover:bg-[#1a1a1a] transition-colors border-r border-[#333333] cursor-pointer"
                  title="Zoom Out"
                  id="zoom-out"
              >
                  <ZoomOut className="w-4 h-4" />
              </button>
              <button
                  onClick={() => graphRef.current?.zoomToFit(400, 50)}
                  className="p-2.5 hover:bg-[#1a1a1a] transition-colors border-r border-[#333333] cursor-pointer"
                  title="Fit to Screen"
                  id="fit-screen"
              >
                  <Maximize className="w-4 h-4" />
              </button>
              <button
                  onClick={() => {
                    if (!graphRef.current) return;
                    // Re-heat simulation to re-layout nodes, then fit
                    graphRef.current.d3ReheatSimulation();
                    setTimeout(() => {
                      graphRef.current?.zoomToFit(400, 60);
                    }, 600);
                  }}
                  className="p-2.5 hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                  title="Reset View"
                  id="reset-view"
              >
                  <RotateCcw className="w-4 h-4" />
              </button>
          </div>
          
          {selectedNode && (
              <div className="absolute bottom-3 right-3 left-3 md:left-auto md:bottom-[30px] md:right-[30px] z-30 md:w-80 bg-[#0A0A0A] border border-[#333333] shadow-2xl p-4 md:p-[20px]">
                  <div className="flex justify-between items-start mb-[15px]">
                      <h3 className="text-[18px] font-black uppercase text-white m-0 tracking-tight leading-tight">{selectedNode.id}</h3>
                      <button onClick={() => setSelectedNode(null)} className="text-[#666666] hover:text-white cursor-pointer bg-transparent border-none p-1">
                          <X size={16} />
                      </button>
                  </div>
                  
                  <div 
                      className="inline-block px-2 py-1 mb-[20px] text-[10px] font-['Courier_New',_monospace] uppercase tracking-wider" 
                      style={{ backgroundColor: NODE_COLORS[selectedNode.type] || '#333333', color: '#000', fontWeight: 'bold' }}
                  >
                      {selectedNode.type}
                  </div>
                  
                  <div className="text-[11px] uppercase tracking-[2px] text-[#666666] mb-[15px] flex items-center">
                    AI Detail
                    <div className="flex-1 h-[1px] bg-[#333333] ml-[10px]"></div>
                  </div>

                  {isExplaining && !nodeDetails[selectedNode.id] ? (
                      <div className="flex items-center gap-2 text-[#666666] text-[12px] font-['Courier_New',_monospace]">
                          <Loader2 size={14} className="animate-spin" /> Generating explanation...
                      </div>
                  ) : (
                      <p className="text-[13px] text-[#BBBBBB] leading-[1.6] m-0">
                          {nodeDetails[selectedNode.id] || "Clicking a node expands its context."}
                      </p>
                  )}
              </div>
          )}

          {graphData.nodes.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
               <div className="text-center space-y-3 opacity-60">
                  <Share2 className="w-12 h-12 mx-auto text-[#333333]" />
                  <p className="text-[14px] font-medium text-[#666666] tracking-wider uppercase">No graph data</p>
                  <p className="text-[12px] text-[#666666] font-['Courier_New',_monospace]">Enter text and extract to see the visualization.</p>
               </div>
            </div>
          ) : (
               <ForceGraph2D
                  ref={graphRef}
                  width={dimensions.width}
                  height={dimensions.height}
                  graphData={graphData}
                  onNodeHover={handleNodeHover as any}
                  onNodeClick={handleNodeClick as any}
                  nodeCanvasObject={drawNode}
                  nodePointerAreaPaint={(node: any, color, ctx) => {
                      ctx.fillStyle = color;
                      const bckgDimensions = node.__bckgDimensions || [20, 20];
                      ctx.fillRect(
                          node.x - bckgDimensions[0] / 2, 
                          node.y - bckgDimensions[1] / 2, 
                          bckgDimensions[0], 
                          bckgDimensions[1]
                      );
                  }}
                  linkCanvasObjectMode={() => 'after'}
                  linkCanvasObject={drawLink}
                  backgroundColor="transparent"
                  d3VelocityDecay={0.3}
                  linkDirectionalArrowLength={3.5}
                  linkDirectionalArrowColor={(link: any) => {
                      const isHighlighted = hoverNode && ((link.source.id ?? link.source) === hoverNode.id || (link.target.id ?? link.target) === hoverNode.id);
                      if (isHighlighted) return '#00FF66';
                      const isDimmed = hoverNode && !isHighlighted;
                      if (isDimmed) return 'rgba(102, 102, 102, 0.2)';
                      return '#666666';
                  }}
                  linkDirectionalArrowRelPos={1}
              />
          )}
        </div>
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"

interface GraphNode {
  id: string
  language: string
  chunk_count: number
  x?: number
  y?: number
  fx?: number | null
  fy?: number | null
  hovered?: boolean
}

interface GraphEdge {
  source: string | GraphNode
  target: string | GraphNode
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface SimulatedLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
}

interface DependencyGraphProps {
  repoId: number
  accumulatedCitations?: unknown[]
  onSelectCitation?: (citationId: number) => void
}

export default function DependencyGraph({
  repoId,
  accumulatedCitations: _accumulatedCitations,
  onSelectCitation: _onSelectCitation
}: DependencyGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [activeFilters, setActiveFilters] = useState<string[]>([])

  const toggleFilter = (lang: string) => {
    setActiveFilters(prev =>
      prev.includes(lang)
        ? prev.filter(l => l !== lang)
        : [...prev, lang]
    )
  }

  const handleZoomIn = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.scaleBy, 1.3)
  }

  const handleZoomOut = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.scaleBy, 0.7)
  }

  const handleRecenter = () => {
    if (!svgRef.current || !zoomBehaviorRef.current) return
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomBehaviorRef.current.transform, d3.zoomIdentity)
  }

  // Fetch graph data
  useEffect(() => {
    if (!repoId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/graph/${repoId}`)
      .then(r => r.json())
      .then(data => {
        setGraphData(data)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [repoId])

  // Render D3 graph
  useEffect(() => {
    if (!graphData || !svgRef.current) return
    if (graphData.nodes.length === 0) return

    // Filter nodes
    const filteredNodes = graphData.nodes.filter(node => {
      if (activeFilters.length > 0) {
        const langLower = (node.language || "").toLowerCase()
        const matchesAnyFilter = activeFilters.some(filter => {
          const f = filter.toLowerCase()
          if (f === "py") return langLower === "python" || langLower === "py"
          if (f === "ts") return langLower === "typescript" || langLower === "ts"
          if (f === "js") return langLower === "javascript" || langLower === "js"
          if (f === "tsx") return langLower === "tsx" || langLower === "jsx"
          return langLower === f
        })
        if (!matchesAnyFilter) return false
      }
      if (searchQuery) {
        const filename = node.id.split("/").pop() || ""
        if (!filename.toLowerCase().includes(searchQuery.toLowerCase())) return false
      }
      return true
    })

    const nodeIds = new Set(filteredNodes.map(n => n.id))
    const filteredLinks = graphData.edges
      .filter(edge => {
        const sourceId = typeof edge.source === "string" ? edge.source : (edge.source as GraphNode).id
        const targetId = typeof edge.target === "string" ? edge.target : (edge.target as GraphNode).id
        return nodeIds.has(sourceId) && nodeIds.has(targetId)
      })

    const width = svgRef.current.parentElement?.clientWidth || 560
    const height = 420

    // Clear
    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()
    svg.attr("width", width).attr("height", height)

    // Defs
    const defs = svg.append("defs")

    // BG Radial Gradient
    const bgGradient = defs.append("radialGradient")
      .attr("id", "bg-gradient")
      .attr("cx", "50%")
      .attr("cy", "50%")
      .attr("r", "70%")
    bgGradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#0D0221")
    bgGradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#000000")

    // Edge blur filter
    defs.append("filter")
      .attr("id", "edge-blur")
      .append("feGaussianBlur")
      .attr("stdDeviation", "0.8")

    // Background Rect
    svg.append("rect")
      .attr("width", width)
      .attr("height", height)
      .attr("fill", "url(#bg-gradient)")
      .attr("rx", 8)

    // Seeded random starfield
    let seed = 12345
    const seededRandom = () => {
      const x = Math.sin(seed++) * 10000
      return x - Math.floor(x)
    }

    const starsGroup = svg.append("g").attr("class", "stars")
    for (let i = 0; i < 80; i++) {
      const x = seededRandom() * width
      const y = seededRandom() * height
      const r = 0.5 + seededRandom() * 0.5
      const opacity = 0.3 + seededRandom() * 0.4
      starsGroup.append("circle")
        .attr("cx", x)
        .attr("cy", y)
        .attr("r", r)
        .attr("fill", "#FFFFFF")
        .attr("opacity", opacity)
    }

    if (filteredNodes.length === 0) {
      svg.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("fill", "#9CA3AF")
        .attr("text-anchor", "middle")
        .attr("font-size", "14px")
        .attr("font-family", "sans-serif")
        .text("No nodes match search or filters")
      return
    }

    // Arrowhead marker
    defs.append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 35)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#FF00FF")
      .attr("opacity", 0.8)

    // Zoom container
    const g = svg.append("g")
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => g.attr("transform", event.transform))
      
    svg.call(zoomBehavior)
    zoomBehaviorRef.current = zoomBehavior

    // Clone data
    const nodes: GraphNode[] = filteredNodes.map(n => ({ ...n }))
    const links: SimulatedLink[] = filteredLinks.map(e => ({
      source: typeof e.source === "string" ? e.source : e.source.id,
      target: typeof e.target === "string" ? e.target : e.target.id
    }))

    // Galaxy color mapping helper
    interface CosmicColors {
      core: string
      mid: string
      dark: string
      glow: string
      specular: string
      rim: string
    }

    const getCosmicColors = (lang: string): CosmicColors => {
      const lower = (lang || "").toLowerCase()
      if (lower === "python" || lower === "py") {
        return { core: "#7C3AED", mid: "#4C1D95", dark: "#1E0A3C", glow: "#8B5CF6", specular: "#DDD6FE", rim: "#6D28D9" }
      }
      if (lower === "typescript" || lower === "ts") {
        return { core: "#2563EB", mid: "#1E3A8A", dark: "#0C1445", glow: "#3B82F6", specular: "#BFDBFE", rim: "#1D4ED8" }
      }
      if (lower === "javascript" || lower === "js") {
        return { core: "#0D9488", mid: "#134E4A", dark: "#042F2E", glow: "#14B8A6", specular: "#CCFBF1", rim: "#0F766E" }
      }
      if (lower === "tsx" || lower === "jsx") {
        return { core: "#BE185D", mid: "#831843", dark: "#3D0C1F", glow: "#EC4899", specular: "#FBCFE8", rim: "#9D174D" }
      }
      return { core: "#5B21B6", mid: "#3B0764", dark: "#1A0533", glow: "#7C3AED", specular: "#C4B5FD", rim: "#4C1D95" }
    }

    // SVG Gradients per node
    nodes.forEach((n, idx) => {
      const c = getCosmicColors(n.language)

      // 1. sphere
      const sphereGrad = defs.append("radialGradient")
        .attr("id", `sphere-${idx}`)
        .attr("cx", "35%")
        .attr("cy", "30%")
        .attr("r", "65%")
      sphereGrad.append("stop").attr("offset", "0%").attr("stop-color", c.specular).attr("stop-opacity", 1)
      sphereGrad.append("stop").attr("offset", "35%").attr("stop-color", c.core).attr("stop-opacity", 1)
      sphereGrad.append("stop").attr("offset", "70%").attr("stop-color", c.mid).attr("stop-opacity", 1)
      sphereGrad.append("stop").attr("offset", "100%").attr("stop-color", c.dark).attr("stop-opacity", 1)

      // 2. glow
      const glowGrad = defs.append("radialGradient")
        .attr("id", `glow-${idx}`)
        .attr("cx", "50%")
        .attr("cy", "50%")
        .attr("r", "50%")
      glowGrad.append("stop").attr("offset", "0%").attr("stop-color", c.glow).attr("stop-opacity", 1)
      glowGrad.append("stop").attr("offset", "100%").attr("stop-color", c.glow).attr("stop-opacity", 0)

      // 3. atmosphere
      const atmoGrad = defs.append("radialGradient")
        .attr("id", `atmosphere-${idx}`)
        .attr("cx", "50%")
        .attr("cy", "50%")
        .attr("r", "50%")
      atmoGrad.append("stop").attr("offset", "0%").attr("stop-color", c.glow).attr("stop-opacity", 0.6)
      atmoGrad.append("stop").attr("offset", "70%").attr("stop-color", c.glow).attr("stop-opacity", 0.2)
      atmoGrad.append("stop").attr("offset", "100%").attr("stop-color", c.glow).attr("stop-opacity", 0)

      // 4. specular
      const specGrad = defs.append("radialGradient")
        .attr("id", `specular-${idx}`)
        .attr("cx", "40%")
        .attr("cy", "40%")
        .attr("r", "60%")
      specGrad.append("stop").attr("offset", "0%").attr("stop-color", "#FFFFFF").attr("stop-opacity", 1)
      specGrad.append("stop").attr("offset", "100%").attr("stop-color", c.specular).attr("stop-opacity", 0)

      // 5. rim
      const rimGrad = defs.append("radialGradient")
        .attr("id", `rim-${idx}`)
        .attr("cx", "50%")
        .attr("cy", "50%")
        .attr("r", "50%")
      rimGrad.append("stop").attr("offset", "0%").attr("stop-color", c.rim).attr("stop-opacity", 0.8)
      rimGrad.append("stop").attr("offset", "100%").attr("stop-color", c.rim).attr("stop-opacity", 0)
    })

    // Edge Gradient per link
    links.forEach((l, idx) => {
      const sNode = nodes.find(n => n.id === (typeof l.source === "string" ? l.source : l.source.id))
      const tNode = nodes.find(n => n.id === (typeof l.target === "string" ? l.target : l.target.id))
      
      const sColors = getCosmicColors(sNode?.language || "")
      const tColors = getCosmicColors(tNode?.language || "")
      
      const edgeGrad = defs.append("linearGradient")
        .attr("id", `edge-grad-${idx}`)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "100%")
      
      edgeGrad.append("stop")
        .attr("offset", "0%")
        .attr("stop-color", sColors.glow)
      
      edgeGrad.append("stop")
        .attr("offset", "100%")
        .attr("stop-color", tColors.glow)
    })

    // Node Sizing
    const nodeRadius = (d: GraphNode) => {
      const count = d.chunk_count || 1
      if (count <= 2) return 14
      if (count <= 5) return 20
      if (count <= 10) return 28
      return 36
    }

    // Simulation
    const simulation = d3.forceSimulation<GraphNode>(nodes)
      .force("link", d3.forceLink<GraphNode, SimulatedLink>(links)
        .id(d => d.id)
        .distance(130))
      .force("charge", d3.forceManyBody().strength(-350))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<GraphNode>()
        .radius(d => nodeRadius(d) + 20))

    // Draw edges with study gradient and blur
    const link = g.append("g")
      .selectAll<SVGLineElement, SimulatedLink>("line")
      .data(links)
      .join("line")
      .attr("stroke", (l, idx) => `url(#edge-grad-${idx})`)
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.4)
      .attr("filter", "url(#edge-blur)")
      .attr("marker-end", "url(#arrowhead)")

    // Draw 3D Sphere Group Nodes
    const node = g.append("g")
      .selectAll<SVGGElement, GraphNode>("g.node")
      .data(nodes)
      .join("g")
      .attr("class", "node")
      .attr("cursor", "pointer")
      .call(
        d3.drag<SVGGElement, GraphNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on("drag", (event, d) => {
            d.fx = event.x; d.fy = event.y
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null; d.fy = null
          })
      )
      .on("mouseover", (event, d) => {
        d.hovered = true
        const tip = tooltipRef.current
        if (tip) {
          tip.style.display = "block"
          tip.style.left = (event.offsetX + 15) + "px"
          tip.style.top = (event.offsetY - 10) + "px"
          tip.innerHTML = `
            <div style="font-family:monospace;font-weight:bold;
              margin-bottom:4px;color:#EDEDED">
              ${d.id.split("/").pop()}
            </div>
            <div style="color:#9CA3AF;font-size:11px;
              margin-bottom:6px">${d.id}</div>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="background:#3B82F620;padding:2px 8px;
                border-radius:4px;font-size:10px;color:#3B82F6">
                ${d.language}
              </span>
              <span style="color:#9CA3AF;font-size:11px">
                ${d.chunk_count} chunks
              </span>
            </div>
          `
        }

        // Scale visual group to 1.2x and increase outer glow opacity
        d3.select(event.currentTarget)
          .select(".visuals")
          .style("transform", "scale(1.2)")

        d3.select(event.currentTarget)
          .select(".outer-glow")
          .transition().duration(150)
          .attr("opacity", 0.4)

        // Highlight edges
        const isConnected = (l: SimulatedLink) => {
          const sId = typeof l.source === "string" ? l.source : l.source.id
          const tId = typeof l.target === "string" ? l.target : l.target.id
          return sId === d.id || tId === d.id
        }

        link
          .transition().duration(150)
          .attr("stroke", l => isConnected(l) ? "#00FFFF" : `url(#edge-grad-${links.indexOf(l)})`)
          .attr("stroke-opacity", l => isConnected(l) ? 1.0 : 0.05)
          .attr("stroke-width", l => isConnected(l) ? 3 : 1.5)
      })
      .on("mousemove", (event) => {
        const tip = tooltipRef.current
        if (tip) {
          tip.style.left = (event.offsetX + 15) + "px"
          tip.style.top = (event.offsetY - 10) + "px"
        }
      })
      .on("mouseout", (event, d) => {
        d.hovered = false
        const tip = tooltipRef.current
        if (tip) {
          tip.style.display = "none"
        }

        // Restore visual group scale and outer glow opacity
        d3.select(event.currentTarget)
          .select(".visuals")
          .style("transform", "scale(1.0)")

        d3.select(event.currentTarget)
          .select(".outer-glow")
          .transition().duration(150)
          .attr("opacity", 0.15)

        // Restore edges
        link
          .transition().duration(150)
          .attr("stroke", l => `url(#edge-grad-${links.indexOf(l)})`)
          .attr("stroke-opacity", 0.4)
          .attr("stroke-width", 1.5)
      })

    // Sub-group for 3D Sphere layers
    const visuals = node.append("g")
      .attr("class", "visuals")
      .style("transition", "transform 0.15s ease-out")

    // 1. OUTER GLOW
    visuals.append("circle")
      .attr("class", "outer-glow")
      .attr("r", d => nodeRadius(d) * 2.2)
      .attr("fill", (d, idx) => `url(#glow-${idx})`)
      .attr("opacity", 0.15)

    // 2. ATMOSPHERE RING
    visuals.append("circle")
      .attr("class", "atmosphere")
      .attr("r", d => nodeRadius(d) * 1.5)
      .attr("fill", (d, idx) => `url(#atmosphere-${idx})`)
      .attr("opacity", 0.25)

    // 3. MAIN SPHERE BODY
    visuals.append("circle")
      .attr("class", "main-body")
      .attr("r", d => nodeRadius(d))
      .attr("fill", (d, idx) => `url(#sphere-${idx})`)

    // 4. SPECULAR HIGHLIGHT
    visuals.append("ellipse")
      .attr("class", "specular")
      .attr("cx", d => -nodeRadius(d) * 0.3)
      .attr("cy", d => -nodeRadius(d) * 0.35)
      .attr("rx", d => nodeRadius(d) * 0.35)
      .attr("ry", d => nodeRadius(d) * 0.25)
      .attr("fill", (d, idx) => `url(#specular-${idx})`)
      .attr("opacity", 0.9)

    // 5. RIM LIGHT
    visuals.append("ellipse")
      .attr("class", "rim")
      .attr("cx", d => nodeRadius(d) * 0.25)
      .attr("cy", d => nodeRadius(d) * 0.3)
      .attr("rx", d => nodeRadius(d) * 0.4)
      .attr("ry", d => nodeRadius(d) * 0.2)
      .attr("fill", (d, idx) => `url(#rim-${idx})`)
      .attr("opacity", 0.4)

    // Text labels inside translated group
    node.append("text")
      .text(d => {
        const parts = d.id.split("/")
        const filename = parts[parts.length - 1]
        return filename.replace(/\.[^/.]+$/, "")
      })
      .attr("x", 0)
      .attr("y", d => nodeRadius(d) + 16)
      .attr("font-size", "11px")
      .attr("font-family", "monospace")
      .attr("fill", "#EDEDED")
      .attr("text-anchor", "middle")
      .attr("pointer-events", "none")

    // Tick (updates parent node transform translated coordinates)
    simulation.on("tick", () => {
      link
        .attr("x1", l => (l.source as GraphNode).x!)
        .attr("y1", l => (l.source as GraphNode).y!)
        .attr("x2", l => (l.target as GraphNode).x!)
        .attr("y2", l => (l.target as GraphNode).y!)

      node
        .attr("transform", d => `translate(${d.x!}, ${d.y!})`)
    })

    // Animation Loop
    let animId: number
    const startTime = performance.now()

    const animate = (time: number) => {
      const elapsed = (time - startTime) / 1000

      // 1. Oscillate outer glow opacity
      node.each(function(d, idx) {
        const freq = 0.5 + (idx % 5) * 0.1
        const opacity = 0.175 + 0.075 * Math.sin(2 * Math.PI * freq * elapsed)
        const isHovered = d.hovered
        if (!isHovered) {
          d3.select(this).select(".outer-glow").attr("opacity", opacity)
        }
      })

      // 2. Rotate specular highlight
      const angle = (elapsed / 8) * 360
      node.each(function() {
        d3.select(this).select(".specular").attr("transform", `rotate(${angle})`)
      })

      animId = requestAnimationFrame(animate)
    }

    animId = requestAnimationFrame(animate)

    return () => {
      simulation.stop()
      cancelAnimationFrame(animId)
    }
  }, [graphData, searchQuery, activeFilters])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      Loading dependency graph...
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center h-64 text-red-400">
      Failed to load graph: {error}
    </div>
  )

  if (!graphData) return null

  if (graphData.nodes.length === 0) return (
    <div className="flex items-center justify-center h-64 text-gray-400">
      No internal dependencies detected in this repository
    </div>
  )

  return (
    <div style={{ width: "100%" }}>
      {/* Controls bar */}
      <div style={{
        display: "flex", gap: "8px", marginBottom: "8px",
        alignItems: "center", flexWrap: "wrap"
      }}>
        <input
          placeholder="Search filename..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            background: "#1a1a2b", border: "1px solid #374151",
            color: "#EDEDED", padding: "6px 12px",
            borderRadius: "6px", fontSize: "12px", width: "180px",
            outline: "none", transition: "all 0.2s"
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#3B82F6" }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#374151" }}
        />
        <button
          onClick={handleZoomIn}
          style={{
            background: "#1a1a2b", border: "1px solid #374151",
            color: "#EDEDED", padding: "6px 12px",
            borderRadius: "6px", fontSize: "12px", cursor: "pointer",
            transition: "all 0.2s"
          }}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = "#3B82F6"; e.currentTarget.style.color = "#3B82F6"; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = "#374151"; e.currentTarget.style.color = "#EDEDED"; }}
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          style={{
            background: "#1a1a2b", border: "1px solid #374151",
            color: "#EDEDED", padding: "6px 12px",
            borderRadius: "6px", fontSize: "12px", cursor: "pointer",
            transition: "all 0.2s"
          }}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = "#3B82F6"; e.currentTarget.style.color = "#3B82F6"; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = "#374151"; e.currentTarget.style.color = "#EDEDED"; }}
        >
          -
        </button>
        <button
          onClick={handleRecenter}
          style={{
            background: "#1a1a2b", border: "1px solid #374151",
            color: "#EDEDED", padding: "6px 12px",
            borderRadius: "6px", fontSize: "12px", cursor: "pointer",
            transition: "all 0.2s"
          }}
          onMouseOver={(e) => { e.currentTarget.style.borderColor = "#3B82F6"; e.currentTarget.style.color = "#3B82F6"; }}
          onMouseOut={(e) => { e.currentTarget.style.borderColor = "#374151"; e.currentTarget.style.color = "#EDEDED"; }}
        >
          Recenter
        </button>
        {["PY", "JS", "TS", "TSX"].map(lang => {
          const isActive = activeFilters.includes(lang)
          const colors: Record<string, string> = {
            PY: "#3B82F6",
            JS: "#10B981",
            TS: "#F59E0B",
            TSX: "#06B6D4"
          }
          const color = colors[lang] || "#8B5CF6"
          return (
            <button
              key={lang}
              onClick={() => toggleFilter(lang)}
              style={{
                background: isActive ? `${color}20` : "#1a1a2b",
                border: `1px solid ${isActive ? color : "#374151"}`,
                color: isActive ? color : "#9CA3AF",
                padding: "6px 12px",
                borderRadius: "6px",
                fontSize: "10px",
                fontWeight: "bold",
                cursor: "pointer",
                transition: "all 0.2s",
                boxShadow: isActive ? `0 0 10px ${color}15` : "none"
              }}
              onMouseOver={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = color;
                  e.currentTarget.style.color = color;
                }
              }}
              onMouseOut={(e) => {
                if (!isActive) {
                  e.currentTarget.style.borderColor = "#374151";
                  e.currentTarget.style.color = "#9CA3AF";
                }
              }}
            >
              {lang}
            </button>
          )
        })}
      </div>

      {/* Graph container */}
      <div style={{ position: "relative", height: "420px" }}>
        {/* SVG */}
        <svg 
          ref={svgRef} 
          style={{ display: "block", width: "100%", height: "100%" }} 
        />

        {/* Tooltip */}
        <div ref={tooltipRef} style={{
          display: "none",
          position: "absolute",
          background: "#1a1a2e",
          border: "1px solid #3B82F6",
          borderRadius: "6px",
          padding: "10px 14px",
          fontSize: "12px",
          color: "#EDEDED",
          pointerEvents: "none",
          zIndex: 100,
          minWidth: "180px",
          boxShadow: "0 4px 20px rgba(59,130,246,0.2)"
        }} />
      </div>
    </div>
  )
}

import React from "react";
import * as d3 from "d3";
import "./forceGraph.css";

export function ForceGraph(props) {
    const containerRef = React.useRef(null);
    const nodeRef = React.useRef(null);
    const simulationRef = React.useRef(null);
    const [selected, setSelected] = React.useState(props.selectedNode);

    // Simulation lives in a ref so all effects below always talk to the same
    // instance. Previously it was a plain const in the function body: a new
    // simulation was created on every render, but only the first one ever got
    // a tick handler (the mount-only effect below). Every later render's
    // effects were calling .nodes()/.links() on a throwaway simulation that
    // had no tick handler and never touched the DOM.
    if (!simulationRef.current) {
        simulationRef.current = d3.forceSimulation()
            .force("charge", d3.forceManyBody().strength(-500))
            .force("link", d3.forceLink().id(d => d.id).distance(150))
            .force("x", d3.forceX())
            .force("y", d3.forceY())
            .alphaMin(0.01);
    }
    const simulation = simulationRef.current;

    const nodeProp = props.nodes;
    const clickProp = props.handleClick;
    const linkProp = props.links;
    const highlightProp = props.highlightedNodes;

    // ── Mount / unmount ───────────────────────────────────────────────────
    React.useEffect(() => {
        const container = containerRef.current;
        const containerRect = container.getBoundingClientRect();
        let height = containerRect.height;
        let width = containerRect.width;

        const svg = d3.select(container)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [-width / 2, -height / 2, width, height]);

        const g = svg.append("g");

        const zoom = d3.zoom()
            .extent([[0, 0], [width, height]])
            .scaleExtent([0.1, 10])
            .on("zoom", ({ transform }) => {
                g.attr("transform", transform);
            });

        svg.call(zoom);

        g.append("g").attr("id", "links");
        g.append("g").attr("id", "nodes");
        g.append("g").attr("id", "labels");

        simulation.on("tick", () => {
            g.select("#links").selectAll("line")
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            g.select("#nodes").selectAll("circle")
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);

            g.select("#labels").selectAll("text")
                .attr("x", d => d.x)
                .attr("y", d => d.y);
        });

        // Keep the SVG filling the container when the window is resized.
        const resizeObserver = new ResizeObserver(entries => {
            const rect = entries[0]?.contentRect;
            if (!rect) return;
            width = rect.width;
            height = rect.height;
            svg.attr("width", width)
                .attr("height", height)
                .attr("viewBox", [-width / 2, -height / 2, width, height]);
            zoom.extent([[0, 0], [width, height]]);
        });
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
            simulation.stop();
            svg.remove();
        };
    }, []);

    // ── Nodes ─────────────────────────────────────────────────────────────
    React.useEffect(() => {
        const g = d3.select(containerRef.current).select("svg").select("g");
        const node = g.select("#nodes");
        const label = g.select("#labels");

        nodeRef.current = new Map(
            node.selectAll("circle").data().map(d => [d.id, d])
        );
        const nodes = nodeProp.map(d => Object.assign(d, nodeRef.current?.get(d.id)));

        simulation.nodes(nodes);
        simulation.alphaTarget(0.1).restart();

        node.selectAll("circle")
            .data(nodes, d => d.id)
            .join(enter => enter.append("circle")
                .attr("r", 12)
                .attr("class", "node inactive"));

        node.selectAll("circle")
            .on("click", (_, d) => {
                setSelected(d.id);
                clickProp(d.id);
            });

        label.selectAll("text")
            .data(nodes, d => d.id)
            .join(enter => enter.append("text")
                .attr("class", "label")
                .attr("dominant-baseline", "central")
                .text(d => d.name));
    }, [nodeProp, clickProp]);

    // ── Links ─────────────────────────────────────────────────────────────
    React.useEffect(() => {
        const link = d3.select(containerRef.current)
            .select("svg").select("g").select("#links");

        const links = linkProp.map(d => Object.assign({}, d));

        link.selectAll("line")
            .data(links, d => [d.source, d.target])
            .join(enter => enter.append("line")
                .attr("class", "link inactive"));

        simulation.force('link').links(links);
        simulation.alphaTarget(0.1).restart();
    }, [linkProp]);

    // ── Highlight ─────────────────────────────────────────────────────────
    React.useEffect(() => {
        const g = d3.select(containerRef.current).select("svg").select("g");
        const node = g.select("#nodes");
        const link = g.select("#links");

        node.selectAll("circle").attr("class", "node inactive");
        link.selectAll("line").attr("class", "link inactive");

        node.selectAll("circle")
            .filter(d => highlightProp.includes(d.id))
            .attr("class", "node nearby");

        node.selectAll("circle")
            .filter(d => d.id === selected)
            .attr("class", "node active");

        link.selectAll("line")
            .filter(d => d.source.id === selected || d.target.id === selected)
            .attr("class", "link active");
    }, [nodeProp, linkProp, highlightProp, selected]);

    // Rename from generic Bootstrap "container" to avoid class collision
    return <div ref={containerRef} className="pn-graph-canvas" />;
}
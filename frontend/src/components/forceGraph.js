import React from "react";
import * as d3 from "d3";
import "./forceGraph.css";

export function ForceGraph(props) {
    const containerRef = React.useRef(null);
    const nodeRef = React.useRef(null);
    const [selected, setSelected] = React.useState(null);

    const simulation = d3.forceSimulation()
        .force("charge", d3.forceManyBody().strength(-500))
        .force("link", d3.forceLink().id(d => d.id).distance(150))
        .force("x", d3.forceX())
        .force("y", d3.forceY())
        .alphaMin(0.01);

    const nodeProp = props.nodes;
    const clickProp = props.handleClick;
    const linkProp = props.links;
    const highlightProp = props.highlightedNodes;

    React.useEffect(() => {
        const container = containerRef.current;
        const containerRect = container.getBoundingClientRect();
        const height = containerRect.height;
        const width = containerRect.width;

        const svg = d3.select(container)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", [-width / 2, -height / 2, width, height]);

        const g = svg.append("g");

        svg.call(d3.zoom()
            .extent([[0, 0], [width, height]])
            .scaleExtent([1, 8])
            .on("zoom", ({ transform }) => {
                g.attr("transform", transform);
            }));

        const link = g.append("g")
            .attr("id", "links");

        const node = g.append("g")
            .attr("id", "nodes");

        const label = g.append("g")
            .attr("id", "labels");

        simulation.on("tick", () => {
            //update link positions
            link.selectAll("line")
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            // update node positions
            node.selectAll("circle")
                .attr("cx", d => d.x)
                .attr("cy", d => d.y);

            // update label positions
            label.selectAll("text")
                .attr("x", d => { return d.x; })
                .attr("y", d => { return d.y; })
        });

        return (() => {
            simulation.stop();
            svg.remove();
        });
    }, []);

    React.useEffect(() => {
        const g = d3
            .select(containerRef.current)
            .select("svg")
            .select("g");

        const node = g.select("#nodes");

        const label = g.select("#labels");

        function clickNode(id) {
            setSelected(id);
            clickProp(id);
        }

        nodeRef.current = new Map(node.selectAll("circle").data().map(d => [d.id, d]));
        let nodes = nodeProp.map(d => Object.assign(d, nodeRef.current?.get(d.id)));

        simulation.nodes(nodes);
        simulation.alphaTarget(0.1).restart();

        node.selectAll("circle")
            .data(nodes, d => d.id)
            .join(enter => enter.append("circle")
                .attr("r", 12)
                .attr("class", "node inactive"));

        node.selectAll("circle")
            .on("click", (_, d) => clickNode(d.id));

        label.selectAll("text")
            .data(nodes, d => d.id)
            .join(enter => enter.append("text")
                .attr("class", "label")
                .attr("dominant-baseline", "central")
                .text(d => d.name));


    }, [nodeProp, clickProp]);

    React.useEffect(() => {
        const g = d3
            .select(containerRef.current)
            .select("svg")
            .select("g");

        const link = g.select("#links");

        let links = linkProp.map(d => Object.assign({}, d));

        link.selectAll("line")
            .data(links, d => [d.source, d.target])
            .join(enter => enter.append("line")
                .attr("class", "link inactive"));

        simulation.force('link').links(links);
        simulation.alphaTarget(0.1).restart();
    }, [linkProp]);

    React.useEffect(() => {
        const g = d3
            .select(containerRef.current)
            .select("svg")
            .select("g");

        const node = g.select("#nodes");
        const link = g.select("#links");

        node.selectAll("circle")
            .attr("class", "node inactive");
        link.selectAll("line")
            .attr("class", "link inactive");

        node.selectAll("circle")
            .filter((d, _) => highlightProp.includes(d.id))
            .attr("class", "node nearby");

        node.selectAll("circle")
            .filter((d, _) => d.id === selected)
            .attr("class", "node active");

        link.selectAll("line")
            .filter((d, _) => d.source.id === selected || d.target.id === selected)
            .attr("class", "link active");

    }, [nodeProp, linkProp, highlightProp, selected]);

    return <div ref={containerRef} className="container" />;
}
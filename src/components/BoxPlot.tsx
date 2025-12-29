import Plot                 from 'react-plotly.js';
import { useRef, useState } from 'react';


interface BoxPlotProps {
  data: [number, number, number, number, number]; // [min, q1, median, q3, max]
  height?: number;
  marker?: number;
}

export default function BoxPlot({ data, height = 36, marker }: BoxPlotProps) {
    const plotRef = useRef<HTMLDivElement>(null);
    const [tooltip, setTooltip] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });

    function handleHover(e: React.PointerEvent<HTMLDivElement>) {
        if (!plotRef.current) return;
        const rect = plotRef.current.getBoundingClientRect();
        setTooltip({
            visible: true,
            x: e.clientX - rect.left + 8,
            y: e.clientY - rect.top + 8
        });
    }

    function handleUnhover() {
        setTooltip(t => ({ ...t, visible: false }));
    }

    return (
        <div style={{ position: 'relative', width: '100%', margin: "0 auto" }} onPointerMove={handleHover} onPointerOut={handleUnhover} ref={plotRef}>
            <Plot
                data={[{
                    x: data,
                    type: 'box',
                    boxpoints: false,
                    marker: { color: '#666' },
                    line: { color: '#666', width: 1 },
                    fillcolor: '#FFF',
                    orientation: 'h',
                    hoverinfo: 'skip',
                }]}
                layout={{
                    margin: { l: 0, r: 0, t: 0, b: 0 },
                    autosize: true,
                    height,
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    xaxis: { visible: false },
                    yaxis: { visible: false },
                    showlegend: false,
                }}
                useResizeHandler={true}
                style={{ width: '100%', height }}
                config={{ displayModeBar: false, staticPlot: false, responsive: true }}
            />
            { marker !== undefined && (
              <div style={{
                  lineHeight: 0,
                  position  : "relative",
                  width     : "90%",
                  margin    : "0px auto",
              }}>
                  <span style={{
                      color:"red",
                      fontSize: "14px",
                      verticalAlign: "top",
                      position: "absolute",
                      left: `${((marker - data[0]) / (data[4] - data[0])) * 100}%`,
                      transform: "translateX(-50%)",
                  }}>🔺</span>
              </div>
            )}
            <Tooltip box={data} marker={marker} x={tooltip.x} y={tooltip.y} visible={tooltip.visible} />
        </div>
    );
}

function Tooltip({ box, marker, x, y, visible }: { box: number[]; marker?: number; x: number; y: number; visible: boolean }) {
    return (
        <div className='text-muted text-center' style={{
            minWidth       : 180,
            width          : 180,
            position       : "absolute",
            top            : y - 90,
            left           : x - 240,
            zIndex         : 10,
            padding        : "10px",
            backgroundColor: "#FFF",
            border         : "1px solid #999",
            borderRadius   : "8px",
            boxShadow      : "0 2px 8px rgba(0,0,0,0.25)",
            opacity        : visible ? 1 : 0,
            transition     : "opacity 0.2s ease-in-out",
            transitionDelay: visible ? "0.2s" : "0s",
            fontSize       : "14px",
            pointerEvents  : "none",
        }}>
            <b className="text-success">Distribution</b>
            <hr style={{margin:"4px 0"}}/>
            <table>
                <tbody>
                    <tr>
                        <td style={{textAlign:"right"}}>Min:&nbsp;</td>
                        <td style={{textAlign:"left"}}>{box[0]}</td>
                    </tr>
                    <tr>
                        <td style={{textAlign:"right"}}>Q1:&nbsp;</td>
                        <td style={{textAlign:"left"}}>{box[1]}</td>
                    </tr>
                    <tr>
                        <td style={{textAlign:"right"}}>Median:&nbsp;</td>
                        <td style={{textAlign:"left"}}><b>{box[2]}</b></td>
                    </tr>
                    <tr>
                        <td style={{textAlign:"right"}}>Q3:&nbsp;</td>
                        <td style={{textAlign:"left"}}>{box[3]}</td>
                    </tr>
                    <tr>
                        <td style={{textAlign:"right"}}>Max:&nbsp;</td>
                        <td style={{textAlign:"left"}}>{box[4]}</td>
                    </tr>
                </tbody>
            </table>
            { marker !== undefined &&
                <>
                    <br/>
                    <b className="text-success">Patient Age at Dx</b>
                    <hr style={{margin:"4px 0"}}/>
                    <span className='badge bg-success rounded-pill px-3'>{Math.round(marker * 12)} months</span>
                </>
            }
        </div>
    );
}

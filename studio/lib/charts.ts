/** /stats chart: followers and daily views for the last 30 days, drawn on the server. */
import type {ChartConfiguration} from 'chart.js';

export type ChartInput = {labels: string[]; followers: (number | null)[]; views: number[]; title: string};

export async function statsChartPng(input: ChartInput): Promise<Buffer> {
  const {ChartJSNodeCanvas} = await import('chartjs-node-canvas');
  const canvas = new ChartJSNodeCanvas({width: 1000, height: 560, backgroundColour: '#0B1030'});
  const grid = 'rgba(255,255,255,0.08)';
  const tick = 'rgba(255,255,255,0.7)';
  const config: ChartConfiguration = {
    type: 'bar',
    data: {
      labels: input.labels,
      datasets: [
        {type: 'bar', label: 'Daily views', data: input.views, backgroundColor: 'rgba(61,245,255,0.55)', borderRadius: 4, yAxisID: 'views', order: 2},
        {type: 'line', label: 'Followers', data: input.followers, borderColor: '#FF7A1A', backgroundColor: '#FF7A1A', borderWidth: 4, pointRadius: 0, tension: 0.3, yAxisID: 'followers', order: 1},
      ],
    },
    options: {
      responsive: false,
      animation: false,
      layout: {padding: 16},
      plugins: {
        title: {display: true, text: input.title, color: '#FFFFFF', font: {size: 26, weight: 'bold'}},
        legend: {labels: {color: tick, font: {size: 18}}},
      },
      scales: {
        x: {ticks: {color: tick, maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: {size: 14}}, grid: {color: grid}},
        views: {position: 'right', beginAtZero: true, ticks: {color: 'rgba(61,245,255,0.9)', font: {size: 14}}, grid: {display: false}},
        followers: {position: 'left', ticks: {color: '#FF7A1A', font: {size: 14}}, grid: {color: grid}},
      },
    },
  };
  return canvas.renderToBuffer(config as any, 'image/png');
}

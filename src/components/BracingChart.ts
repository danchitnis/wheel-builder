import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  LinearScale,
  Tooltip,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

export type BracingChartInstance = Chart<'bar', number[], string>;

export function createBracingChart(
  canvas: HTMLCanvasElement,
  [bracingLeft, bracingRight]: [number, number],
): BracingChartInstance {
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['Left bracing', 'Right bracing'],
      datasets: [{
        label: 'Bracing Angle (deg)',
        data: [bracingLeft, bracingRight],
        backgroundColor: ['rgba(59, 130, 246, 0.45)', 'rgba(239, 68, 68, 0.45)'],
        borderColor: ['#3b82f6', '#ef4444'],
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true },
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#919299', font: { family: 'JetBrains Mono' } },
          max: 15,
          min: 0,
        },
        x: {
          grid: { display: false },
          ticks: { color: '#bebfc4', font: { family: 'Space Grotesk', weight: 'bold' } },
        },
      },
    },
  });
}

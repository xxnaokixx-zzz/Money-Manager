'use client';

import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

// Chart.jsの初期化
ChartJS.register(ArcElement, Tooltip, Legend);

interface DoughnutChartProps {
  data: {
    labels: string[];
    datasets: {
      data: number[];
      backgroundColor: string[];
      borderWidth: number;
    }[];
  };
  options: {
    cutout: string;
    plugins: {
      legend: {
        display: boolean;
      };
      tooltip: {
        enabled: boolean;
      };
    };
  };
}

export default function DoughnutChart({ data, options }: DoughnutChartProps) {
  return <Doughnut data={data} options={options} />;
} 
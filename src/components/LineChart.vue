<template>
    <canvas ref="canvas"></canvas>
  </template>
  
  <script lang="ts">
  import { defineComponent, onMounted, ref, watch } from 'vue';
  import Chart from 'chart.js/auto';
  
  export default defineComponent({
    props: {
      data: Array
    },
    setup(props) {
      const canvas = ref(null);
      let chart: Chart | null = null;
  
      onMounted(() => {
        chart = new Chart(canvas.value, {
          type: 'line',
          data: {
            labels: [...Array(props.data.length).keys()],
            datasets: [{
              label: 'Sensor Value',
              data: props.data,
              fill: false,
              borderColor: 'rgb(75, 192, 192)',
              tension: 0.1
            }]
          }
        });
      });
  
      watch(() => props.data, (newData) => {
        if (chart) {
          chart.data.labels = [...Array(newData.length).keys()];
          chart.data.datasets[0].data = newData;
          chart.update();
        }
      });
  
      return { canvas };
    }
  });
  </script>
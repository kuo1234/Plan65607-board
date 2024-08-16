<template>
    <div class="button-container">
        <!-- Put more button in this area -->
    </div>
    <div v-for="(records, ip) in data" :key="ip">
        <h3>{{ ip }}</h3>
        <ul>
            <li v-for="record in records" :key="record.ECG">
                ECG: {{ record.ECG }}, EMG: {{ record.EMG }}, EDA: {{ record.EDA }}, Temp: {{ record.Temp }}, Humidity: {{ record.Humi }}
            </li>
        </ul>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const data = ref({});

onMounted(() => {
    window.electronAPI.onSensorDataUpdate(newData => {
        data.value = { ...data.value, [newData.ip]: newData.data };
    });
});

const loadData = async () => {
    data.value = await window.electronAPI.getDeviceData();
};

loadData();
</script>
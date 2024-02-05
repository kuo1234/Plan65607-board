<template>
 
  
  <router-view></router-view>
  <div class="flex-center">
</div>

</template>



<script setup lang="ts">
import HelloWorld from './components/HelloWorld.vue'
</script>

<style>

body {
  background-color: #121212; /* 深色背景 */
  color: #e0e0e0; /* 淺色文字 */
}

.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo.electron:hover {
  filter: drop-shadow(0 0 2em #9FEAF9);
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}
</style>

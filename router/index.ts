import { createRouter, createWebHashHistory } from 'vue-router';
import HelloWorld from '../src/components/HelloWorld.vue';
import StudentPage from '../src/views/StudentPage.vue';

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HelloWorld,
  },
  {
    path: '/student-page',
    name: 'StudentPage',
    component: StudentPage,
  },
];

const router = createRouter({
  // history: createWebHistory(import.meta.env.BASE_URL),
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;

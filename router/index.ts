import { createRouter, createWebHashHistory } from 'vue-router';
import HelloWorld from '../src/components/HelloWorld.vue';
import StudentPage from '../src/views/StudentPage.vue';
import BiosignalPage from '../src/views/BiosignalPage.vue';
import HistoryPage from '../src/views/HistoryPage.vue';

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
  {
    path: '/biosignal-page',
    name: 'BiosignalPage',
    component: BiosignalPage,
  },
  {
    path: '/history-page',
    name: 'HistoryPage',
    component: HistoryPage,
  },
];

const router = createRouter({
  // history: createWebHistory(import.meta.env.BASE_URL),
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;

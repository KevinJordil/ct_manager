import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router/index.js'
import { i18n, setLocale } from './i18n/index.js'
import App from './App.vue'
import './style.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

// Also stamps <html lang> for the initial language.
setLocale(i18n.global.locale.value)

app.mount('#app')

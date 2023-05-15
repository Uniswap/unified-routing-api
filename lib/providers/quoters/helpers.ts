import axios from 'axios';

const DEFAULT_AXIOS_TIMEOUT = 5000;

axios.defaults.timeout = DEFAULT_AXIOS_TIMEOUT;

export default axios;

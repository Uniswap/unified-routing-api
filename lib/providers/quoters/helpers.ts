import axios from 'axios';

const DEFAULT_AXIOS_TIMEOUT = 10_000;

axios.defaults.timeout = DEFAULT_AXIOS_TIMEOUT;

export default axios;

import axios from 'axios';

const DEFAULT_AXIOS_TIMEOUT = 750;

axios.defaults.timeout = DEFAULT_AXIOS_TIMEOUT

export default axios;
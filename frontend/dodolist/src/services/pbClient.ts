import PocketBase from 'pocketbase';
import { PB_URL } from '@/config';

const pb = new PocketBase(PB_URL);
export default pb;

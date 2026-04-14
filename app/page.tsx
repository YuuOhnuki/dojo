import { ClientPage } from './client-page';
import packageJson from '@/package.json';

export default function Home() {
    return <ClientPage appVersion={packageJson.version} />;
}

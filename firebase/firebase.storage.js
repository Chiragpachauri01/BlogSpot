import { getStorage } from "firebase/storage";
import { app } from "./firebase.config";
export const storage = getStorage(app);

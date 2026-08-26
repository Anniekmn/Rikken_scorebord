import { createClient } from "@supabase/supabase-js";

// Dit is de "publishable" sleutel, bedoeld om zichtbaar te zijn in de website
// (Row Level Security in Supabase beschermt de data). Dit is dus veilig om
// hier te laten staan.
const SUPABASE_URL = "https://goyvnmcslcjddxrxxeox.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mNPibQrBt6_ssYTn6CRb4w_K8U2dpQX";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

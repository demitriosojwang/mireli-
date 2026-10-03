import { redirect } from "next/navigation";

/** The queue is the console's home. */
export default function Home() {
  redirect("/compliance");
}
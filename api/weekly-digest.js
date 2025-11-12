import 'dotenv/config';
import fs from "fs/promises";
import OpenAI from "openai";
import { Resend } from "resend";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

function calcMetrics(d) {
  const revenue = d.sales.web + d.sales.pos;
  const aov = d.sales.orders ? revenue / d.sales.orders : 0;
  const ordersDelta = d.sales.prev_orders
    ? ((d.sales.orders - d.sales.prev_orders) / d.sales.prev_orders) * 100
    : 0;
  return { revenue, aov, ordersDelta };
}

export default async function handler(req, res) {
  console.log("Running weekly digest script...");
  console.log("OpenAI key loaded:", !!process.env.OPENAI_API_KEY);
  console.log("Resend key loaded:", !!process.env.RESEND_API_KEY);
  console.log("Test email:", process.env.TEST_EMAIL);
  console.log("Reading data from sample.json...");
  try {
    const data = JSON.parse(await fs.readFile("data/sample.json", "utf8"));
    const { revenue, aov, ordersDelta } = calcMetrics(data);

    const prompt = `
Write a concise 3-sentence summary for a winery manager based on:
Total Revenue: $${revenue.toFixed(0)}
Average Order Value: $${aov.toFixed(2)}
Orders Δ: ${ordersDelta.toFixed(1)}%
Club: +${data.club.joins} joins, ${data.club.cancels} cancels
Top Wines: ${data.topSkus.map(w => w.name).join(", ")}
Keep it plain and actionable.
`;

    const ai = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150,
      temperature: 0.4
    });

    const summary = ai.choices[0].message.content.trim();

    const html = `
      <div style="font-family:system-ui;line-height:1.5;">
        <h2>Weekly Winery Digest</h2>
        <p>${summary}</p>
        <hr/>
        <p><strong>Revenue:</strong> $${revenue.toLocaleString()}<br/>
        <strong>AOV:</strong> $${aov.toFixed(2)}<br/>
        <strong>Orders Δ:</strong> ${ordersDelta.toFixed(1)}%</p>
      </div>
    `;

    // Send email (you can set your own address)
    await resend.emails.send({
      from: "WineSnap <onboarding@resend.dev>",
      to: process.env.TEST_EMAIL || "your@email.com",
      subject: "Your Weekly Winery Digest",
      html
    });
    console.log("Email sent successfully!");
    res.status(200).json({ ok: true, summary });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
// run locally when executed via `node api/weekly-digest.js`
if (process.argv[1].includes("weekly-digest.js")) {
  (async () => {
    console.log("Running weekly digest locally...");
    const result = await handler({}, { status: (c) => ({ json: (o) => console.log(c, o) }) });
    console.log("Done.");
  })();
}
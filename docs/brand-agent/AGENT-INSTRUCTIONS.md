# Sliquid Brand Agent — durable instructions

Paste the block below into the Sliquid Brand Agent's **Instructions** field in the ChatGPT
workspace agent builder.

## Why this differs from the original handoff

The handoff's step 5 said *"treat the returned image as the only approved packaging reference."*
That instruction assumes the agent can see the image `get_packshot` returns. **It cannot.**

ChatGPT's MCP connector renders an MCP `{ type: "image" }` result as an empty `{}`, and the bytes
never become model-visible input. OpenAI support confirmed this in April 2026 as an
"integration-surface mismatch" and has not committed a fix. The image block is still returned —
MCP Inspector and other MCP clients do render it — but the agent must never depend on seeing it.

Two consequences shape the wording below:

1. **Identity comes from `structuredContent`, not from looking at the picture.** The agent
   confirms which bottle it has by reading `product`, `size`, `sku` and `sha256` as text.
2. **Any visual output must go through `create_product_composition`.** That tool composites the
   untouched packshot server-side and returns a finished image, so the product pixels never pass
   through a generative redraw. It is the primary path, not a fallback.

---

## The instruction block

```
For every request involving Sliquid product imagery:

1. Call search_packshots first. Never answer from memory, web images, or screenshots.

2. Resolve the exact product, size, and active package version before going further.

3. If the request is ambiguous, ask. Never choose silently.
   "Sliquid H2O" is ambiguous — H2O ships in 2 oz, 4.2 oz, and 8.5 oz.
   Present the options and let the person pick.

4. Note that Sliquid retail sizes are 2 oz, 4.2 oz, and 8.5 oz. There is no
   "4 oz" or "8 oz" product. If someone asks for "4 oz", they mean 4.2 oz —
   confirm rather than assuming.

5. Call get_packshot with the selected asset_id.
   You will NOT be able to see the returned image. This is expected.
   Confirm what you retrieved by reading the structuredContent fields:
   product, size, sku, package_version, sha256.
   Never claim to have visually inspected the packshot.

6. To produce any visual output, call create_product_composition.
   This is the only supported way to generate Sliquid product artwork.
   It composites the approved packshot over a generated background
   server-side, so the packaging is pixel-preserved.

7. Never reconstruct, redraw, relabel, recolor, retouch, distort, crop
   through, or obscure Sliquid packaging. Never ask an image tool to
   "draw a bottle of Sliquid H2O" — the packaging must come from the
   approved asset, always.

8. If no active approved asset is returned, stop and say exactly what is
   missing. Do not substitute a different size, flavor, formula, legacy
   label, or a similar-looking product.

9. If a product comes back as discontinued, say so plainly and name it.
   Do not offer the discontinued packshot for new marketing work.

10. In your final response, state the product, size, asset_id, and package
    version you used, so the selection is auditable.
```

---

## What the agent will and won't be able to do

| Task | Works? | Path |
|---|---|---|
| "Which sizes does Sliquid Sea come in?" | Yes | `search_packshots` |
| "Is Organics Silk still current?" | Yes | `search_packshots`, returns discontinued status |
| "Get me the approved H2O 4.2 oz packshot file" | Partly | `get_packshot` returns bytes, but ChatGPT will not display them — the person should download from the portal Media page instead |
| "Make a 4:5 social post with H2O on a marble surface" | Yes | `create_product_composition` |
| "Look at this packshot and tell me what's on the label" | **No** | The agent cannot see MCP-returned images |

If image delivery to the chat window turns out to matter more than we expect, the fallback is to
have `create_product_composition` write its output to the portal and return a link — but note
OpenAI warns against embedding tool-provided image URLs, so that needs its own review.

import htm from "htm";
import vhtml from "vhtml";

const html = htm.bind(vhtml);

type _AnyCardProps = {
  id: string;
  href: string;
  headline: string;
  publishedAt: string;
};

type VerticalCardProps = _AnyCardProps & {
  size?: "s" | "md" | "lg";
};
function VerticalCard(props: VerticalCardProps) {
  const formattedPublishedAt = Intl.DateTimeFormat("fi-FI", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Helsinki",
  }).format(new Date(props.publishedAt));
  return html`
    <div class="Card" data-orientation="vertical" data-size="${props.size ?? "md"}">
      <${RandomCardImage} aspectRatio="1.67" seed="${props.id}" width="1024" />
      <div class="Card__Content">
        <a href="${props.href}">
          <h3>${props.headline}</h3>
        </a>
        <time datetime="${props.publishedAt}">${formattedPublishedAt}</time>
      </div>
    </div>
  `;
}

type HorizontalCardProps = _AnyCardProps;
function HorizontalCard(props: HorizontalCardProps) {
  const formattedPublishedAt = Intl.DateTimeFormat("fi-FI", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Helsinki",
  }).format(new Date(props.publishedAt));
  return html`
    <div class="Card" data-orientation="horizontal">
      <div class="Card__Content">
        <a href="${props.href}">
          <h3>${props.headline}</h3>
        </a>
        <time datetime="${props.publishedAt}">${formattedPublishedAt}</time>
      </div>
      <${RandomCardImage} aspectRatio="1" seed="${props.id}" width="512" />
    </div>
  `;
}

type RandomCardImageProps = {
  aspectRatio: string;
  seed: string;
  width: string;
};
function RandomCardImage({ aspectRatio, seed, width }: RandomCardImageProps) {
  const _width = () => width;
  const _height = () => Math.round(parseFloat(width) / parseFloat(aspectRatio)).toString();
  return html`
    <figure class="Card__Image">
      <img src="https://picsum.photos/seed/${seed}/${_width()}/${_height()}" />
    </figure>
  `;
}

export { HorizontalCard, VerticalCard, html };

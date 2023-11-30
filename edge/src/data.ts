export type Article = {
  id: string;
  data: {
    headline: string;
    excerpt: string | null;
    published_at: string;
    tags: string[];
    meta_yle_url?: string;
  };
  html: string;
};

export interface ArticlesProvider {
  getArticles(): Promise<Article[]>;
  getArticlesByTag(tag: string): Promise<Article[]>;
  getArticle(id: string): Promise<Article>;
}

export function makeArticlesProvider(env: Env): ArticlesProvider {
  return {
    async getArticles(limit = 64) {
      const indexObject = await env.BUCKET.get("_articles/.meta/index/by-published-at.json");
      const index = ((await indexObject?.json()) ?? []) as { id: string }[];
      const articles = await Promise.all(
        index
          .slice(0, limit)
          .map(({ id }) => ({ key: `_articles/${id}/article.json` }))
          .map(async ({ key }) => {
            const id = key.split("/")[1];
            const object = await env.BUCKET.get(key);
            const content = await object?.text();
            if (!content) return [];
            const article = { id, ...JSON.parse(content) } as Article;
            return [article];
          }),
      );
      return articles.flat();
    },
    async getArticlesByTag(tag: string, limit = 64) {
      const indexObject = await env.BUCKET.get("_articles/.meta/index/by-tag.json");
      const index = ((await indexObject?.json()) ?? {}) as Record<string, { id: string }[]>;
      const articles = await Promise.all(
        (index[tag] ?? [])
          .slice(0, limit)
          .map(({ id }) => ({ key: `_articles/${id}/article.json` }))
          .map(async ({ key }) => {
            const id = key.split("/")[1];
            const object = await env.BUCKET.get(key);
            const content = await object?.text();
            if (!content) return [];
            const article = { id, ...JSON.parse(content) } as Article;
            return [article];
          }),
      );
      return articles.flat();
    },
    async getArticle(id: string) {
      const object = await env.BUCKET.get(`_articles/${id}/article.json`);
      const content = await object?.text();
      if (!content) throw new Error("not found");
      const article = { id, ...JSON.parse(content) } as Article;
      return article;
    },
  };
}

export function makeStaticArticlesProvider(): ArticlesProvider {
  const articles: Article[] = Array.from({ length: 5 }).map((_, idx) => ({
    id: (idx + 1).toString(),
    data: {
      headline: "Raja-Joosepin asemalle tuli tänään 55 rajanylittäjää - suurin osa tulijoista miehiä",
      excerpt: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      published_at: new Date().toISOString(),
      tags: ["Tag 1", "Tag 2"],
      meta_yle_url: "https://yle.fi",
    },
    html: "<p>Helsinki saa pian näyttävää lisävalaistusta ydinkeskustaansa.</p>\n<p>Ensi viikon lauantaina Pikkuparlamentin puistossa Kiasmaa vastapäätä paljastetaan presidentti <strong>Mauno Koiviston</strong> muistomerkki, jopa kuusimetrinen terästaideteos <em>Välittäjä</em>.</p>\n<p>15 metriä pitkä kaksiosainen teos on paitsi kunnianosoitus edesmenneelle presidentille, myös muutos ympäristöön. Se valaistaan sekä sivuilta että alta, ja Pikkuparlamentin puistoa on muokattu teokseen sopivaksi.</p>\n<p>– Olen todella otettu, nöyrä ja kiitollinen, että olen saanut tämän tehdä, kertoo teoksen luonut kuvanveistäjä <strong>Kirsi Kaulanen</strong>.</p>\n<p>Vuonna 2017 kuolleen presidentti Koiviston muistomerkki paljastetaan yleisölle 25. marraskuuta, kun Koiviston syntymästä tulee kuluneeksi sata vuotta.</p>\n<h2>Koiviston kaksi puolta</h2>\n<p>Kaulanen valittiin muistomerkin tekijäksi valtioneuvoston kanslian järjestämän kilpailun kautta vuonna 2021. Koko projekti kesti yhteensä neljä vuotta.</p>\n<p>Teos on läpikuljettava. Siihen kohdistuvat valot muuttavat muotoaan ajastetusti, joten muistomerkki toimii samalla valotaideteoksena.</p>\n<p>Kivetyn aukion päällä seisova teos rakentuu kahdesta muodosta, jotka Kaulasen mukaan osin kuvaavat presidentti Koivistoa.</p>\n<p>– Toinen muoto on rauhallinen ja vakaa, ja toinen taas kompleksisempi ja filosofisempi. Ehkä se ratkoo ongelmia, ehkä se on myös humoristinen.</p>\n<p>Kaulanen halusi, että kokija voi saapua veistoksen äärelle, ja pohtia, mitä on välittäjyys.</p>\n<p>– Koivisto toimi idän ja lännen välissä välittäjänä ja rauhan rakentajana. Kun pääsee kävelemään veistoksen sisälle, voi itse pohtia, että kuinka itse voisi olla rauhan välittäjä tässä ajassa.</p>\n<h2>Pikkuparlamentin puisto uuteen loistoon</h2>\n<p>Koiviston lisäksi teosta inspiroi sen sijainti, Pikkuparlamentin puisto. Aiemmin hämärän puiston valaistusta on suunniteltu yhdessä muun muassa Helsingin kaupungin kanssa.</p>\n<p>– Puiston valaisu tulee nyt pitkälti tämän veistoksen kautta. Toivon, että tämä houkuttelee kävelemään puistossa myös kaamosaikaan.</p>\n<p>Teoksen materiaalina on käytetty ruostumatonta terästä, joka Kaulasen mukaan soveltuu hyvin herkkienkin muotojen toteuttamiseen myös isossa mittakaavassa. Teräs myös peilaa valoa hyvin.</p>\n<p>– Tämän pitäisi kestää tässä satoja, satoja vuosia.</p>\n<p>Ensi viikon lauantaina kello 17 alkavassa muistomerkin julkistustilaisuudessa on odotettavissa paitsi puheita, myös musiikkia kahden uuden sävellyksen ensisoiton merkeissä.</p>",
  }));
  return {
    async getArticles() {
      return articles;
    },
    async getArticlesByTag() {
      return articles;
    },
    async getArticle(id: string) {
      const article = articles.find((article) => article.id === id);
      if (!article) throw new Error("not found");
      return article;
    },
  };
}

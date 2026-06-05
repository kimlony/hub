package com.bizbee.hub.news;

import lombok.Data;

@Data
public class NewsRow {
    private Long id;
    private String source;
    private String category;
    private String title;
    private String summary;
    private String url;
    private String corpName;
    private String contentHash;
    private String publishedAt;
    private String createdAt;
}

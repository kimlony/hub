package hub.news.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class NewsResponse {
    private Long id;
    private String source;
    private String category;
    private String title;
    private String summary;
    private String url;
    private String corpName;
    private String publishedAt;
}

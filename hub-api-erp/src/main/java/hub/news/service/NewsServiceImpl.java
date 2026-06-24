package hub.news.service;

import hub.news.domain.NewsRow;
import hub.news.dto.response.NewsResponse;
import hub.news.mapper.NewsMapper;
import hub.news.NewsSearchCondition;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NewsServiceImpl implements NewsService {

    private final NewsMapper newsMapper;

    @Override
    public Map<String, Object> getNewsList(NewsSearchCondition cond) {
        int total = newsMapper.countList(cond);
        List<NewsResponse> list = newsMapper.findList(cond)
                .stream()
                .map(this::toResponse)
                .toList();

        return Map.of(
                "total", total,
                "list", list,
                "page", cond.getPage(),
                "size", cond.getSize()
        );
    }

    private NewsResponse toResponse(NewsRow row) {
        return NewsResponse.builder()
                .id(row.getId())
                .source(row.getSource())
                .category(row.getCategory())
                .title(row.getTitle())
                .summary(row.getSummary())
                .url(row.getUrl())
                .corpName(row.getCorpName())
                .publishedAt(row.getPublishedAt())
                .build();
    }
}

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

import org.apache.commons.io.FileUtils;
import org.apache.lucene.analysis.standard.StandardAnalyzer;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.queryparser.classic.QueryParser;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.store.Directory;
import org.apache.lucene.store.FSDirectory;

public class LuceneTest {
    private static String indexDirectory;

    public static void main(String[] args) throws Exception {
        File file = Files.createTempDirectory("test_lucene").toFile();
        indexDirectory = file.getAbsolutePath();
        FileUtils.forceDeleteOnExit(file);
        IndexWriter writer = createWriter();
        List<Document> documents = new ArrayList<>();

        Document document1 = createDocument(1, "Andy", "XU", "andxu@microsoft.com");
        documents.add(document1);

        Document document2 = createDocument(2, "Jinbo", "Wang", "jinbwan@microsoft.com");
        documents.add(document2);

        //Let's clean everything first
        writer.deleteAll();

        writer.addDocuments(documents);
        writer.commit();
        writer.close();

        IndexSearcher searcher = createSearcher();

        //Search by ID
        TopDocs foundDocs = searchById(2, searcher);

        System.out.println("Total Results :: " + foundDocs.totalHits);

        for (ScoreDoc sd : foundDocs.scoreDocs) {
            Document d = searcher.doc(sd.doc);
            System.out.println(String.format("%s, %s, %s", d.get("id"), d.get("email"), d.get("firstName")));
        }

        //Search by firstName
        TopDocs foundDocs2 = searchByFirstName("Andy", searcher);

        System.out.println("Total Results :: " + foundDocs2.totalHits);

        for (ScoreDoc sd : foundDocs2.scoreDocs) {
            Document d = searcher.doc(sd.doc);
            System.out.println(String.format("%s, %s, %s", d.get("id"), d.get("email"), d.get("firstName")));
        }
    }

    private static Document createDocument(Integer id, String firstName, String lastName, String email) {
        Document document = new Document();
        document.add(new StringField("id", id.toString(), Field.Store.YES));
        document.add(new TextField("firstName", firstName, Field.Store.YES));
        document.add(new TextField("lastName", lastName, Field.Store.YES));
        document.add(new TextField("email", email, Field.Store.YES));
        return document;
    }

    private static IndexWriter createWriter() throws IOException {
        FSDirectory dir = FSDirectory.open(Paths.get(indexDirectory));
        IndexWriterConfig config = new IndexWriterConfig(new StandardAnalyzer());
        IndexWriter writer = new IndexWriter(dir, config);
        return writer;
    }

    private static TopDocs searchByFirstName(String firstName, IndexSearcher searcher) throws Exception {
        QueryParser qp = new QueryParser("firstName", new StandardAnalyzer());
        Query firstNameQuery = qp.parse(firstName);
        TopDocs hits = searcher.search(firstNameQuery, 10);
        return hits;
    }

    private static TopDocs searchById(Integer id, IndexSearcher searcher) throws Exception {
        QueryParser qp = new QueryParser("id", new StandardAnalyzer());
        Query idQuery = qp.parse(id.toString());
        TopDocs hits = searcher.search(idQuery, 10);
        return hits;
    }

    private static IndexSearcher createSearcher() throws IOException {
        Directory dir = FSDirectory.open(Paths.get(indexDirectory));
        IndexReader reader = DirectoryReader.open(dir);
        IndexSearcher searcher = new IndexSearcher(reader);
        return searcher;
    }
}